import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Engine } from '@sitemaxxing/core';

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });

let lastProject: string | null = null;

/** One stateless MCP server + transport per HTTP request (Streamable HTTP, no sessions). */
export async function createMcpServer(engine: Engine) {
  const server = new McpServer({ name: 'sitemaxxing', version: '0.1.0' });
  const projectOf = (passId?: string, projectId?: string) => {
    const id = projectId ?? (passId?.includes(':') ? passId.split(':')[0] : undefined) ?? lastProject;
    if (!id) throw new Error('No project: call init_project or pass project_id');
    lastProject = id;
    return id;
  };
  const ensure = async (id: string) => {
    if (!engine.hasProject(id)) await engine.loadRegistered(id);
    return id;
  };
  const stripState = (s: any) => ({
    project: s.project?.name,
    score: s.score?.score,
    view: s.view,
    previewing: s.previewing,
    currentVersion: s.currentVersion,
    passes: s.passes.map((p: any) => ({ id: p.id, name: p.name, status: p.status, points: p.points, variant: p.chosenVariantId, variants: p.variants.map((v: any) => v.id), stale: p.status === 'stale', skipReason: p.skipReason, summary: p.summary })),
    versions: s.versions,
  });

  server.registerTool('init_project', { description: 'Register a repo (path) and its dev server URL; returns the project id, sections and the baseline Mog score.', inputSchema: { path: z.string(), dev_url: z.string().optional() } }, async ({ path, dev_url }) => {
    const r = await engine.initProject(path, dev_url);
    lastProject = r.projectId;
    return text(r);
  });
  server.registerTool('audit_page', { description: 'Snapshot the page, score it, and propose the ordered passes with findings.', inputSchema: { project_id: z.string().optional() } }, async ({ project_id }) => {
    const id = await ensure(projectOf(undefined, project_id));
    const s = await engine.audit(id);
    return text({ ...stripState(s), findings: s.passes.map((p) => ({ id: p.id, findings: p.findings })) });
  });
  server.registerTool('list_passes', { description: 'Passes with status, variants, points and stale flags.', inputSchema: { project_id: z.string().optional() } }, async ({ project_id }) => text(stripState(engine.state(await ensure(projectOf(undefined, project_id)))).passes));
  server.registerTool('preview_pass', { description: 'Apply a pass (and optional variant) to the working tree and highlight it live.', inputSchema: { pass_id: z.string(), variant_id: z.string().optional() } }, async ({ pass_id, variant_id }) => {
    await engine.preview(await ensure(projectOf(pass_id)), pass_id, variant_id);
    return text({ ok: true });
  });
  server.registerTool('end_preview', { description: 'Reverse the previewed pass.', inputSchema: { project_id: z.string().optional() } }, async ({ project_id }) => {
    await engine.endPreview(await ensure(projectOf(undefined, project_id)));
    return text({ ok: true });
  });
  server.registerTool(
    'decide_pass',
    { description: 'Approve, reject, pick a variant, or regenerate a pass. Logs a decision.', inputSchema: { pass_id: z.string(), action: z.enum(['approve', 'reject', 'pick', 'regenerate']), variant_id: z.string().optional(), reason_chip: z.enum(['too busy', 'too plain', 'off-brand', 'too trendy']).optional() } },
    async ({ pass_id, action, variant_id, reason_chip }) => {
      const s = await engine.decide(await ensure(projectOf(pass_id)), pass_id, action, variant_id, { reasonChip: reason_chip });
      const p = s.passes.find((x) => x.id === pass_id);
      return text({ pass_id, status: p?.status, variant: p?.chosenVariantId });
    },
  );
  server.registerTool('regenerate_pass', { description: 'Re-run propose for a stale pass against the current tree.', inputSchema: { pass_id: z.string() } }, async ({ pass_id }) => {
    const s = await engine.decide(await ensure(projectOf(pass_id)), pass_id, 'regenerate');
    const p = s.passes.find((x) => x.id === pass_id);
    return text({ pass_id, status: p?.status, variants: p?.variants.map((v) => v.id) });
  });
  server.registerTool('set_copy', { description: 'Set a copy key in the content file; the overlay types it in.', inputSchema: { key: z.string(), text: z.string(), project_id: z.string().optional() } }, async ({ key, text: t, project_id }) => text(await engine.setCopy(await ensure(projectOf(undefined, project_id)), key, t)));
  server.registerTool('report_pass', { description: 'For agents editing code directly: highlight what you changed in the overlay.', inputSchema: { name: z.string(), selectors: z.array(z.string()), project_id: z.string().optional() } }, async ({ name, selectors, project_id }) => {
    engine.reportPass(await ensure(projectOf(undefined, project_id)), name, selectors);
    return text({ ok: true });
  });
  server.registerTool('commit_version', { description: 'Squash approved passes into one git commit and a new version with screenshots and score.', inputSchema: { project_id: z.string().optional() } }, async ({ project_id }) => text(await engine.commit(await ensure(projectOf(undefined, project_id)))));
  server.registerTool('get_score', { description: 'Mog score and metrics, for the current state or a version.', inputSchema: { project_id: z.string().optional(), version: z.number().optional() } }, async ({ project_id, version }) => text(engine.getScore(await ensure(projectOf(undefined, project_id)), version)));
  server.registerTool('search_rules', { description: 'Search the rule cards that ground the passes.', inputSchema: { query: z.string() } }, async ({ query }) => text(engine.searchRules(query)));
  for (const [name, phase] of [
    ['rank_for_me', 2],
    ['get_trend', 4],
    ['taste_card', 2],
  ] as const) {
    server.registerTool(name, { description: `Stub until phase ${phase}.`, inputSchema: {} }, async () => text({ status: 'not_implemented', phase }));
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return { server, transport };
}
