-- Function agents: specialists (engineering, SEO, creative, social) that every client gets as a hire by default.
-- Additive only: three nullable or defaulted columns on client_agents, one index, and a backfill of assignments.
-- kind: client (a client lead or hire, the default for every existing agent) or function (assigned to every client).
-- function_label and description are the routing text client agents read at GET /api/agent-agents.
ALTER TABLE client_agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'client' CHECK (kind IN ('client', 'function'));
ALTER TABLE client_agents ADD COLUMN function_label TEXT;
ALTER TABLE client_agents ADD COLUMN description TEXT;

-- The four existing function agents. Only a row that is still kind client is touched, so a re-run changes nothing.
UPDATE client_agents SET
  kind = 'function',
  function_label = CASE id
    WHEN 'engineering-lead' THEN 'Engineering'
    WHEN 'seo-analytics' THEN 'SEO and analytics'
    WHEN 'creative-producer' THEN 'Creative production'
    WHEN 'social-content-ops' THEN 'Social and content operations'
  END,
  description = CASE id
    WHEN 'engineering-lead' THEN 'Designs and builds software changes as pull requests with tests: web apps, APIs, integrations, fixes. Choose it when a card needs code, a repo change, or a technical design. Production and Cloudflare changes need Christopher approval.'
    WHEN 'seo-analytics' THEN 'Audits and improves search and AI-answer visibility: on-page SEO, schema, keyword and content briefs, Search Console and GA4 reporting. Choose it for rankings, traffic, or citation work.'
    WHEN 'creative-producer' THEN 'Produces creative assets: images, video, design direction, and brand visuals. Choose it when a card needs pictures, clips, or creative direction.'
    WHEN 'social-content-ops' THEN 'Plans and writes social posts, captions, blog and email content, and runs the content calendar. Choose it for social, copy, or publishing work.'
  END
WHERE kind = 'client' AND id IN ('engineering-lead', 'seo-analytics', 'creative-producer', 'social-content-ops');

-- Backfill: every function agent becomes a hire on every live client it is not already on.
-- A pair that has any assignment row, live or ended, is skipped, so an assignment staff ended on purpose stays ended.
-- A client is a live organization of kind client that is not internal, or one that already has a live client agent.
INSERT INTO agent_assignments (id, agent_id, organization_id, workspace_id, project_id, role, assigned_by, assigned_at, ended_at)
SELECT lower(hex(randomblob(16))), a.id, o.id, NULL, NULL, 'hire', 'migration:0049', CAST(strftime('%s', 'now') AS INTEGER) * 1000, NULL
FROM client_agents a CROSS JOIN organizations o
WHERE a.kind = 'function' AND a.revoked_at IS NULL AND o.archived_at IS NULL
  AND ((o.kind = 'client' AND o.is_internal = 0) OR EXISTS (
    SELECT 1 FROM agent_assignments l JOIN client_agents lc ON lc.id = l.agent_id
    WHERE l.organization_id = o.id AND l.ended_at IS NULL AND lc.kind = 'client' AND lc.revoked_at IS NULL))
  AND NOT EXISTS (SELECT 1 FROM agent_assignments x WHERE x.agent_id = a.id AND x.organization_id = o.id);

-- Last, so a run that stopped halfway runs the whole step again (every statement above is safe to repeat).
CREATE INDEX client_agents_kind ON client_agents (kind, revoked_at);
