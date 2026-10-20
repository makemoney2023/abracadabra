import { describe, expect, it } from 'vitest';
import { agentModeOn, refuseRunStart } from './agent-mode';

describe('AGENT_MODE guard', () => {
  it('only "agents" turns it on', () => {
    expect(agentModeOn({})).toBe(false);
    expect(agentModeOn({ AGENT_MODE: 'legacy' })).toBe(false);
    expect(agentModeOn({ AGENT_MODE: ' Agents ' })).toBe(true);
  });

  it('refuses POST /api/execute in agents mode with 409 and a clear message', async () => {
    const refused = refuseRunStart({ AGENT_MODE: 'agents' }, 'POST', '/api/execute');
    expect(refused?.status).toBe(409);
    const body = (await refused!.json()) as { error: string; message: string };
    expect(body.error).toBe('agent_mode');
    expect(body.message).toContain('AGENT_MODE is agents');
  });

  it('leaves legacy mode and every other endpoint alone, so in-flight runs keep reporting', () => {
    expect(refuseRunStart({}, 'POST', '/api/execute')).toBeNull();
    expect(refuseRunStart({ AGENT_MODE: 'legacy' }, 'POST', '/api/execute')).toBeNull();
    for (const [method, path] of [
      ['GET', '/api/status'],
      ['GET', '/api/artifacts'],
      ['GET', '/api/report'],
      ['GET', '/api/ws'],
      ['GET', '/api/templates'],
    ]) {
      expect(refuseRunStart({ AGENT_MODE: 'agents' }, method, path)).toBeNull();
    }
  });
});
