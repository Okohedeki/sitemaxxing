import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { preparePlayground, removeTree, spawnVite, waitForUrl, killTree } from '@sitemaxxing/core';
import { startHub, type Hub } from './index';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PORT = 5197;
const HUB_PORT = 3397;

describe('mcp server over streamable http', () => {
  let hub: Hub;
  let vite: ReturnType<typeof spawnVite>;
  let dir: string;
  let client: Client;

  beforeAll(async () => {
    dir = preparePlayground(path.join(ROOT, 'apps', 'sample-fieldnote'), path.join(ROOT, '.playground', `mcp-${process.pid}`), { fresh: true, devUrl: `http://localhost:${PORT}` });
    vite = spawnVite(dir, PORT);
    expect(await waitForUrl(`http://localhost:${PORT}`, 30_000)).toBe(true);
    hub = await startHub({ port: HUB_PORT, registryFile: path.join(os.tmpdir(), `sitemaxxing-mcp-${process.pid}.json`), log: () => undefined, versionPortBase: 5400 });
    client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${HUB_PORT}/mcp`)));
  }, 90_000);

  afterAll(async () => {
    await client?.close();
    await hub?.close();
    if (vite) killTree(vite);
    try {
      removeTree(dir);
    } catch {
      /* best effort */
    }
  });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? '';
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  it('lists the tools from the brief', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ['init_project', 'audit_page', 'list_passes', 'preview_pass', 'end_preview', 'decide_pass', 'regenerate_pass', 'set_copy', 'report_pass', 'commit_version', 'get_score', 'search_rules', 'set_brief', 'reroll_pass', 'read_design_system', 'rank_for_me', 'get_trend', 'taste_card']) {
      expect(names).toContain(n);
    }
  });

  it('runs audit → preview → decide → commit end to end', async () => {
    const init = await call('init_project', { path: dir, dev_url: `http://localhost:${PORT}` });
    expect(init.projectId).toBeTruthy();
    const refused = await call('audit_page', { project_id: init.projectId });
    expect(String(refused)).toMatch(/story/i);
    const brief = await call('set_brief', { project_id: init.projectId, story: 'Fieldnote maps soil moisture from daily satellite passes so growers water only where it is dry.', audience: 'farm managers', goal: 'signups', feeling: ['precise', 'calm'], noise: 0.3, seed: 77 });
    expect(brief.brief.goal).toBe('signups');
    const audit = await call('audit_page', { project_id: init.projectId });
    expect(audit.passes.length).toBe(17);
    expect(audit.passes.find((p: any) => p.name === 'Copy').why).toMatch(/^For sign-ups/);
    const copy = audit.passes.find((p: any) => p.name === 'Copy');
    expect((await call('preview_pass', { pass_id: copy.id })).ok).toBe(true);
    expect((await call('end_preview', {})).ok).toBe(true);
    const decided = await call('decide_pass', { pass_id: copy.id, action: 'approve' });
    expect(decided.status).toBe('approved');
    const direction = audit.passes.find((p: any) => p.name === 'Visual direction');
    const stretch = direction.variants[1];
    const picked = await call('decide_pass', { pass_id: direction.id, action: 'pick', variant_id: stretch });
    expect(picked.variant).toBe(stretch);
    const rerolled = await call('reroll_pass', { pass_id: audit.passes.find((p: any) => p.name === 'Font').id });
    expect(rerolled[0].status).toBe('proposed');
    await call('decide_pass', { pass_id: direction.id, action: 'approve' });
    const committed = await call('commit_version', { project_id: init.projectId });
    expect(committed.version).toBe(2);
    expect(committed.sha).toMatch(/^[0-9a-f]{40}$/);
    const score = await call('get_score', { project_id: init.projectId, version: 2 });
    expect(score.score).toBeGreaterThan(0);
    const rules = await call('search_rules', { query: 'line length' });
    expect(rules[0].id).toBe('butterick-line-length');
    expect((await call('rank_for_me')).status).toBe('not_implemented');
  }, 120_000);
});
