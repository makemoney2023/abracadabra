-- Card owner among the client's agents (lead or hire). Additive only.
-- NULL means the client's lead agent, as before. Moving a card to Doing, or Client Services sending it back,
-- hands it to this agent while it is still live and assigned to the card's client, else to the lead.
ALTER TABLE tasks ADD COLUMN assignee_agent_id TEXT REFERENCES client_agents(id);

CREATE INDEX tasks_agent_assignee ON tasks (assignee_agent_id, status);
