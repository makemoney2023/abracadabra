const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"] as const;

type RobotsGroup = {
  agents: string[];
  body: string;
};

function parseRobotsGroups(robotsTxt: string): RobotsGroup[] {
  const lines = robotsTxt.split(/\r?\n/);
  const groups: RobotsGroup[] = [];
  let agents: string[] = [];
  let bodyLines: string[] = [];

  const flush = () => {
    if (agents.length === 0 && bodyLines.length === 0) return;
    groups.push({ agents, body: bodyLines.join("\n") });
    agents = [];
    bodyLines = [];
  };

  for (const line of lines) {
    const agentMatch = /^\s*user-agent\s*:\s*(.+?)\s*$/i.exec(line);
    if (agentMatch) {
      // New group starts when we already have directives for the previous agents.
      if (bodyLines.length > 0) flush();
      agents.push(agentMatch[1]);
      continue;
    }
    bodyLines.push(line);
  }
  flush();
  return groups;
}

/** True when the group disallows the whole site (`Disallow: /` alone). */
function groupBlocksSite(body: string): boolean {
  return /^\s*disallow\s*:\s*\/\s*$/im.test(body);
}

export function analyzeRobots(robotsTxt: string | null) {
  if (!robotsTxt) {
    return { present: false, blocksGptBot: false, blockedAiBots: [] as string[] };
  }

  const groups = parseRobotsGroups(robotsTxt);
  const blockedAiBots: string[] = [];

  for (const bot of AI_BOTS) {
    const blocked = groups.some(
      (group) =>
        group.agents.some((agent) => agent.toLowerCase() === bot.toLowerCase()) &&
        groupBlocksSite(group.body),
    );
    if (blocked) blockedAiBots.push(bot);
  }

  return {
    present: true,
    blocksGptBot: blockedAiBots.includes("GPTBot"),
    blockedAiBots,
  };
}
