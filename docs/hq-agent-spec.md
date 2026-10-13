# HQ agent: spec and implementation plan

Status: specification. Nothing in this document is built yet except where a section says "exists."
This extends [agency-dashboard-gameplan.md](agency-dashboard-gameplan.md) sections 7, 9, 10, and 12.
Where the two disagree, this document wins, and the gameplan gets a pointer.

Sources: [Cloudflare Agents](https://developers.cloudflare.com/agents/),
[MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)
(the product older docs call Agents Gateway),
[Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api), and the code under `handoff/`.

---

## 1. What the agent is for

The HQ agent does client work end to end for every client at once, and tells staff what it is doing.

For each client it:

1. Reads what the client gave us: the uploaded files, the intake survey, the won deal, the website.
2. Writes the brief (PRD) and the design system, and gets them approved.
3. Turns the brief into tasks on the Work board. Each task names the skills it will run.
4. Runs those skills. Writing, research, planning, and CRM work happen inside the Worker.
5. Sends a task to a Cursor cloud agent only when it is in the **build** stage and needs a program the Worker cannot run.
6. Pulls the finished piece into the client's Finished work, publishes it, and emails the client once.
7. Reports progress, questions, and blockers to staff on the dashboard the whole way through.

Rules that do not bend:

- The agent never sends client conversation mail. The "work is ready" notice is product mail sent by the dashboard after a clean pull.
- `can_publish` stays off on the agent's key. Built work publishes through a dashboard path with its own gate, not through an agent tool.
- Raw uploaded files, survey answers, mail bodies, and other repos never enter a Cursor prompt. Only text the agent wrote itself does.
- Source code is not copied into D1. Only manifest-listed media and copy go to R2.
- The agent has no D1 binding and no binding to the client file bucket. Everything it knows about a client arrives through MCP.
- The agent connects to one MCP portal. Extra MCP servers are added on that portal. The agent is not redeployed to gain them.
