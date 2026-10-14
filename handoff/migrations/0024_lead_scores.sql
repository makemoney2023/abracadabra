-- Schema-check score on each deal and where the lead goes next.
-- routing_status: ready_for_outbound (score < 70, needs our work), nurture (score >= 70, C quality), or NULL.
ALTER TABLE deals ADD COLUMN lead_score INTEGER;
ALTER TABLE deals ADD COLUMN scored_at TEXT;
ALTER TABLE deals ADD COLUMN routing_status TEXT;
