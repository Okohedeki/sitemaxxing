import type { Engine, DecisionMeta } from '@sitemaxxing/core';

type Handler = (params: Record<string, any>) => Promise<unknown>;

/** The JSON-RPC surface used by the control room over the WebSocket. Mirrors the MCP tools. */
export function rpcHandlers(engine: Engine): Record<string, Handler> {
  const pid = (params: Record<string, any>): string => {
    const id = params.project_id ?? params.projectId ?? (typeof params.pass_id === 'string' && params.pass_id.includes(':') ? params.pass_id.split(':')[0] : undefined);
    if (!id) throw new Error('project_id required');
    return String(id);
  };
  const meta = (p: Record<string, any>): DecisionMeta => ({ dwellMs: p.dwell_ms ?? p.dwellMs, shownAlongside: p.shown_alongside ?? p.shownAlongside, reasonChip: p.reason_chip ?? p.reasonChip });
  const ensureLoaded = async (id: string) => {
    if (!engine.hasProject(id)) await engine.loadRegistered(id);
  };
  return {
    'projects.list': async () => engine.listProjects(),
    'project.load': async (p) => {
      await ensureLoaded(pid(p));
      return engine.state(pid(p));
    },
    recreate_url: async (p) => engine.recreate(String(p.url ?? '')),
    init_project: async (p) => engine.initProject(String(p.path), p.dev_url ? String(p.dev_url) : undefined),
    audit_page: async (p) => {
      await ensureLoaded(pid(p));
      return engine.audit(pid(p));
    },
    state: async (p) => {
      await ensureLoaded(pid(p));
      return engine.state(pid(p));
    },
    list_passes: async (p) => engine.listPasses(pid(p)),
    preview_pass: async (p) => engine.preview(pid(p), String(p.pass_id), p.variant_id ? String(p.variant_id) : undefined, meta(p)),
    end_preview: async (p) => engine.endPreview(pid(p)),
    decide_pass: async (p) => engine.decide(pid(p), String(p.pass_id), p.action, p.variant_id ? String(p.variant_id) : undefined, meta(p)),
    reject_reason: async (p) => engine.addReason(pid(p), String(p.pass_id), p.reason_chip ?? null),
    regenerate_pass: async (p) => engine.decide(pid(p), String(p.pass_id), 'regenerate'),
    set_brief: async (p) => {
      await ensureLoaded(pid(p));
      return engine.setBrief(pid(p), p.brief ?? p);
    },
    get_brief: async (p) => {
      await ensureLoaded(pid(p));
      return engine.getBrief(pid(p));
    },
    reroll_pass: async (p) => engine.reroll(pid(p), p.pass_id ? String(p.pass_id) : undefined),
    approve_all: async (p) => engine.approveAll(pid(p)),
    set_view: async (p) => engine.setView(pid(p), p.view === 'current' ? 'current' : 'changes'),
    view_version: async (p) => engine.viewVersion(pid(p), p.number ? Number(p.number) : null),
    commit_version: async (p) => engine.commit(pid(p)),
    get_score: async (p) => engine.getScore(pid(p), p.version ? Number(p.version) : undefined),
    search_rules: async (p) => engine.searchRules(String(p.query ?? '')),
    rule_card: async (p) => engine.ruleCard(String(p.id)) ?? null,
    set_copy: async (p) => engine.setCopy(pid(p), String(p.key), String(p.text)),
    report_pass: async (p) => {
      engine.reportPass(pid(p), String(p.name), Array.isArray(p.selectors) ? p.selectors.map(String) : []);
      return { ok: true };
    },
    read_design_system: async (p) => {
      await ensureLoaded(pid(p));
      return engine.readSystem(pid(p));
    },
    export_design_system: async (p) => {
      await ensureLoaded(pid(p));
      return engine.exportSystem(pid(p));
    },
    save_design_system: async (p) => {
      await ensureLoaded(pid(p));
      return engine.saveSystem(pid(p), p.format ?? 'designMd');
    },
    decisions: async (p) => engine.decisions(pid(p)),
  };
}
