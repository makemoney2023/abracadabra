export type ConnectorTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ConnectorContext = {
  grant: (organizationId: string, connectorId: string) => Promise<string | null>;
  fetchImpl: typeof fetch;
  accessToken: () => Promise<string>;
};

export type ConnectorModule = {
  id: string;
  tools: ConnectorTool[];
  call(tool: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<string>;
};

export function moduleById(modules: readonly ConnectorModule[], id: string): ConnectorModule | undefined {
  return modules.find((mod) => mod.id === id);
}
