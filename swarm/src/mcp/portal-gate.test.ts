import { describe, expect, it } from 'vitest';
import type { McpServerConfig } from '../types';
import { headersFor, portalAllowed, serversForRun } from './portal-gate';

const portal: McpServerConfig = {
  id: 'portal',
  name: 'MCP portal',
  url: 'https://mcp.example/mcp',
  headers: { Authorization: 'Bearer stored' },
};
const demo: McpServerConfig = { id: 'swarm-demo', name: 'Swarm demo', url: 'https://swarm.example/demo-mcp/mcp' };

describe('portal gate', () => {
  it('allows a matching bearer and refuses a missing or wrong one', async () => {
    expect(await portalAllowed('Bearer test-run-secret', 'test-run-secret')).toBe(true);
    expect(await portalAllowed(null, 'test-run-secret')).toBe(false);
    expect(await portalAllowed('Bearer other', 'test-run-secret')).toBe(false);
    expect(await portalAllowed('Bearer test-run-secret', '')).toBe(false);
  });

  it('drops the portal server when the run is not allowed and keeps the demo', () => {
    expect(serversForRun([portal, demo], false)).toEqual([demo]);
    expect(serversForRun([portal, demo], true)).toEqual([portal, demo]);
  });

  it('adds Access headers only for an allowed portal call and ignores saved headers', () => {
    const env = { CF_ACCESS_CLIENT_ID: 'access-id', CF_ACCESS_CLIENT_SECRET: 'access-secret' };
    expect(headersFor(portal, env, true)).toEqual({
      'CF-Access-Client-Id': 'access-id',
      'CF-Access-Client-Secret': 'access-secret',
    });
    expect(headersFor(portal, env, false)).toBeUndefined();
    expect(headersFor(portal, {}, true)).toBeUndefined();
    expect(headersFor({ ...demo, headers: { 'X-Demo': '1' } }, env, true)).toEqual({ 'X-Demo': '1' });
  });
});
