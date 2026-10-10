import type { Sql } from "@/db/sql";
import { rulesFromBrief } from "@/lib/channel-plan";
import { templateOnCard } from "@/lib/swarm-ready";

type ScoreBucket = { total?: unknown; band?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** A sentence from stored score numbers. Survey answers never enter this text. */
export function answerSummaryFromScores(scoresJson: string, totalScore: number | null): string {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(scoresJson);
  } catch {
    parsed = null;
  }
  const root = asRecord(parsed) ?? {};
  const overall = (asRecord(root.overall) ?? {}) as ScoreBucket;
  const readiness = (asRecord(root.readiness) ?? {}) as ScoreBucket;
  const growth = (asRecord(root.growth) ?? {}) as ScoreBucket;
  const visibility = (asRecord(root.visibility) ?? {}) as ScoreBucket;
  const total = asNumber(overall.total) ?? totalScore;
  const band = typeof overall.band === "string" ? overall.band : null;
  const parts: string[] = [];
  if (total != null) parts.push(band ? `Overall ${band} (${total}/100).` : `Overall score ${total}.`);
  const readinessTotal = asNumber(readiness.total);
  const growthTotal = asNumber(growth.total);
  const visibilityTotal = asNumber(visibility.total);
  if (readinessTotal != null) parts.push(`Readiness ${readinessTotal}.`);
  if (growthTotal != null) parts.push(`Growth ${growthTotal}.`);
  if (visibilityTotal != null) parts.push(`Visibility ${visibilityTotal}.`);
  return parts.length > 0 ? parts.join(" ") : "No scored summary is stored.";
}

export async function liveOrganization(sql: Sql, organizationId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL",
    [organizationId],
  );
  return row != null;
}

export async function workspaceInOrganization(
  sql: Sql,
  organizationId: string,
  workspaceId: string,
): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT id FROM workspaces
     WHERE id = ? AND organization_id = ? AND purged_at IS NULL`,
    [workspaceId, organizationId],
  );
  return row != null;
}

export async function organizationWorkspaceIds(sql: Sql, organizationId: string): Promise<string[]> {
  const rows = await sql.all<{ id: string }>(
    `SELECT id FROM workspaces
     WHERE organization_id = ? AND purged_at IS NULL
     ORDER BY slug`,
    [organizationId],
  );
  return rows.map((row) => row.id);
}

type SkillStep = { path?: unknown; mode?: unknown; status?: unknown };

function skillSteps(skillsJson: string | null): { path: string; mode: string; status: string }[] {
  if (!skillsJson) return [];
  try {
    const parsed = JSON.parse(skillsJson) as { steps?: unknown };
    if (!Array.isArray(parsed.steps)) return [];
    return parsed.steps.flatMap((step) => {
      const row = step as SkillStep;
      if (typeof row.path !== "string") return [];
      return [
        {
          path: row.path,
          mode: typeof row.mode === "string" ? row.mode : "complete",
          status: typeof row.status === "string" ? row.status : "todo",
        },
      ];
    });
  } catch {
    return [];
  }
}

/** The picture the HQ agent reads before it writes a brief. Answers stay in the database. */
export async function clientContext(sql: Sql, organizationId: string): Promise<Record<string, unknown>> {
  const organization = await sql.get<{
    id: string;
    name: string;
    website: string | null;
    industry: string | null;
    notes: string | null;
    brief_approval: string;
    auto_publish_built: number;
    agent_paused_at: number | null;
  }>(
    `SELECT id, name, website, industry, notes, brief_approval, auto_publish_built, agent_paused_at
     FROM organizations WHERE id = ? AND archived_at IS NULL`,
    [organizationId],
  );
  if (!organization) throw new Error("Unknown organization.");

  const deal = await sql.get<{ id: string; title: string; stage: string; closed_at: number | null }>(
    `SELECT id, title, stage, closed_at FROM deals
     WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
  const assessment = await sql.get<{ scores_json: string; total_score: number | null }>(
    `SELECT scores_json, total_score FROM assessments
     WHERE organization_id = ? AND completed_at IS NOT NULL
     ORDER BY completed_at DESC LIMIT 1`,
    [organizationId],
  );
  const projects = await sql.all<{ id: string; name: string; status: string; description: string | null }>(
    `SELECT id, name, status, description FROM projects WHERE organization_id = ? ORDER BY name, id`,
    [organizationId],
  );
  const project = await sql.get<{
    id: string;
    name: string;
    status: string;
    due_at: number | null;
    description: string | null;
  }>(
    `SELECT id, name, status, due_at, description FROM projects
     WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
  const milestones = project
    ? await sql.all<{ name: string; due_at: number | null; done_at: number | null }>(
        "SELECT name, due_at, done_at FROM milestones WHERE project_id = ? ORDER BY sort",
        [project.id],
      )
    : [];
  const workspaces = await sql.all<{
    id: string;
    slug: string;
    display_name: string;
    logo_object_key: string | null;
    policy_profile: string;
    clean: number | null;
    waiting: number | null;
    failed: number | null;
  }>(
    `SELECT w.id, w.slug, w.display_name, w.logo_object_key, w.policy_profile,
            SUM(CASE WHEN r.status = 'ready' THEN 1 ELSE 0 END) AS clean,
            SUM(CASE WHEN r.status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
            SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM workspaces w
     LEFT JOIN file_reads r ON r.workspace_id = w.id
     WHERE w.organization_id = ? AND w.purged_at IS NULL
     GROUP BY w.id
     ORDER BY w.slug`,
    [organizationId],
  );
  const repos = await sql.all<{ id: string; full_name: string; project_id: string | null; default_branch: string | null }>(
    `SELECT id, full_name, project_id, default_branch FROM repos
     WHERE organization_id = ? ORDER BY full_name`,
    [organizationId],
  );
  const briefs = await sql.all<{
    id: string;
    kind: string;
    status: string;
    version: number;
    published_version: number | null;
  }>(
    `SELECT id, kind, status, version, published_version FROM deliverables
     WHERE organization_id = ? AND kind IN ('brief', 'design_system') AND status != 'archived'
     ORDER BY updated_at DESC`,
    [organizationId],
  );
  const tasks = await sql.all<{
    id: string;
    title: string;
    status: string;
    stage: string;
    round: number;
    deliverable_id: string | null;
    cursor_agent_id: string | null;
    skills_json: string | null;
    blocked_reason: string | null;
    project_id: string | null;
    position: number;
    created_at: number;
  }>(
    `SELECT id, title, status, stage, round, deliverable_id, cursor_agent_id, skills_json, blocked_reason,
            project_id, position, created_at
     FROM tasks WHERE organization_id = ? ORDER BY position, created_at, id`,
    [organizationId],
  );
  const notes = await sql.all<{ body: string; task_id: string | null }>(
    `SELECT body, json_extract(data_json, '$.taskId') AS task_id
     FROM activities
     WHERE organization_id = ? AND actor_kind = 'staff' AND kind = 'staff.instruction'
     ORDER BY created_at`,
    [organizationId],
  );
  const openQuestions = await sql.all<{ id: string; question: string; asked_at: number }>(
    `SELECT id, question, asked_at FROM agent_questions
     WHERE organization_id = ? AND answered_at IS NULL
     ORDER BY asked_at`,
    [organizationId],
  );
  const answeredSince = await sql.all<{ id: string; question: string; answer: string; answered_at: number }>(
    `SELECT id, question, answer, answered_at FROM agent_questions
     WHERE organization_id = ? AND answered_at IS NOT NULL
     ORDER BY answered_at DESC LIMIT 20`,
    [organizationId],
  );
  const currentBrief = await getBrief(sql, organizationId, "brief");
  const briefBody = currentBrief?.body;
  let scores: unknown = null;
  if (assessment) {
    try {
      scores = JSON.parse(assessment.scores_json);
    } catch {
      scores = null;
    }
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      website: organization.website,
      industry: organization.industry,
      notes: organization.notes,
      rules: rulesFromBrief(typeof briefBody === "string" ? briefBody : ""),
      briefApproval: organization.brief_approval,
      autoPublishBuilt: organization.auto_publish_built === 1,
      agentPausedAt: organization.agent_paused_at,
    },
    deal: deal
      ? { id: deal.id, title: deal.title, stage: deal.stage, wonAt: deal.stage === "won" ? deal.closed_at : null }
      : null,
    assessment: assessment
      ? {
          totalScore: assessment.total_score,
          scores,
          answerSummary: answerSummaryFromScores(assessment.scores_json, assessment.total_score),
        }
      : null,
    project: project
      ? {
          id: project.id,
          name: project.name,
          status: project.status,
          dueAt: project.due_at,
          description: project.description,
          milestones: milestones.map((row) => ({ name: row.name, dueAt: row.due_at, doneAt: row.done_at })),
        }
      : null,
    projects: projects.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      description: row.description,
    })),
    workspaces: workspaces.map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      logoObjectKey: row.logo_object_key,
      policyProfile: row.policy_profile,
      fileCounts: { clean: row.clean ?? 0, waiting: row.waiting ?? 0, failed: row.failed ?? 0 },
    })),
    repos: repos.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      projectId: row.project_id,
      defaultBranch: row.default_branch,
    })),
    briefs: briefs.map((row) => ({
      deliverableId: row.id,
      kind: row.kind,
      status: row.status,
      version: row.version,
      publishedVersion: row.published_version,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      stage: task.stage,
      round: task.round,
      projectId: task.project_id,
      position: task.position,
      createdAt: task.created_at,
      deliverableId: task.deliverable_id,
      cursorAgentId: task.cursor_agent_id,
      skills: skillSteps(task.skills_json),
      templateId: templateOnCard(task.skills_json),
      blockedReason: task.blocked_reason,
      staffNotes: notes.filter((note) => note.task_id === task.id).map((note) => note.body),
    })),
    openQuestions: openQuestions.map((row) => ({ id: row.id, question: row.question, askedAt: row.asked_at })),
    answeredSince: answeredSince.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      answeredAt: row.answered_at,
    })),
  };
}

export async function getBrief(
  sql: Sql,
  organizationId: string,
  kind: "brief" | "design_system",
  projectId?: string | null,
): Promise<Record<string, unknown> | null> {
  const project = projectId?.trim() || null;
  const deliverable = await sql.get<{
    id: string;
    title: string;
    status: string;
    version: number;
    project_id: string | null;
  }>(
    `SELECT id, title, status, version, project_id FROM deliverables
     WHERE organization_id = ? AND kind = ? AND status != 'archived'
       AND (? IS NULL OR project_id = ?)
     ORDER BY CASE WHEN project_id = ? THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [organizationId, kind, project, project, project],
  );
  if (!deliverable) return null;
  const items = await sql.all<{ title: string; copy_text: string | null }>(
    `SELECT title, copy_text FROM deliverable_items
     WHERE deliverable_id = ? AND version = ?
     ORDER BY sort`,
    [deliverable.id, deliverable.version],
  );
  const preferred = items.find((item) => item.title === "brief.md" || item.title === "design-system.md");
  const body = preferred?.copy_text ?? items.find((item) => item.copy_text)?.copy_text ?? "";
  const previousItems =
    deliverable.version > 1
      ? await sql.all<{ title: string; copy_text: string | null }>(
          `SELECT title, copy_text FROM deliverable_items
           WHERE deliverable_id = ? AND version = ?
           ORDER BY sort`,
          [deliverable.id, deliverable.version - 1],
        )
      : [];
  const previousPreferred = previousItems.find((item) => item.title === "brief.md" || item.title === "design-system.md");
  const previousBody = previousPreferred?.copy_text ?? previousItems.find((item) => item.copy_text)?.copy_text ?? "";
  const changes = await sql.all<{ id: string; item_id: string | null; version: number; body: string | null }>(
    `SELECT id, item_id, version, body FROM deliverable_feedback
     WHERE deliverable_id = ? AND version = ? AND decision = 'changes'
     ORDER BY created_at`,
    [deliverable.id, deliverable.version],
  );
  return {
    deliverableId: deliverable.id,
    projectId: deliverable.project_id,
    kind,
    status: deliverable.status,
    version: deliverable.version,
    title: deliverable.title,
    body,
    previousBody,
    changes: changes.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      version: row.version,
      decision: "changes",
      body: row.body,
    })),
  };
}

export async function listFeedback(
  sql: Sql,
  organizationId: string,
  deliverableId: string,
): Promise<{ id: string; itemId: string | null; version: number; decision: string; body: string | null }[]> {
  const owned = await sql.get<{ id: string }>(
    "SELECT id FROM deliverables WHERE id = ? AND organization_id = ?",
    [deliverableId, organizationId],
  );
  if (!owned) return [];
  const rows = await sql.all<{
    id: string;
    item_id: string | null;
    version: number;
    decision: string;
    body: string | null;
  }>(
    `SELECT id, item_id, version, decision, body FROM deliverable_feedback
     WHERE deliverable_id = ?
     ORDER BY created_at`,
    [deliverableId],
  );
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    version: row.version,
    decision: row.decision,
    body: row.body,
  }));
}
