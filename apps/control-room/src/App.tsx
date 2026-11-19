import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HubEvent, ProjectState, PassView, ReasonChip } from '@sitemaxxing/core/protocol';
import { HubClient, hubUrl } from './hub';
import { TopBar } from './components/TopBar';
import { StepRail } from './components/StepRail';
import { Stage } from './components/Stage';
import { Queue } from './components/Queue';
import type { StoryDraft } from './components/StoryForm';

export interface Project {
  id: string;
  name: string;
  devUrl: string;
  rootPath: string;
  loaded: boolean;
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 200) : ms));

export function App() {
  const hub = useMemo(() => new HubClient(hubUrl), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [state, setState] = useState<ProjectState | null>(null);
  const [mode, setMode] = useState<'url' | 'repo'>('repo');
  const [field, setField] = useState('');
  const [live, setLive] = useState<{ text: string; on: boolean }>({ text: 'Connecting to the hub…', on: false });
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, ReasonChip | undefined>>({});
  const [connected, setConnected] = useState(false);
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null);
  const [editingStory, setEditingStory] = useState(false);
  const lastScore = useRef<number | null>(null);
  const hoverStart = useRef<Record<string, number>>({});
  const playingRef = useRef(false);
  const hoverTimer = useRef<number | null>(null);

  const say = useCallback((text: string, on = false) => setLive({ text, on }), []);
  /** States returned by an RPC were built while the engine was still busy; the busy event clears it. */
  const adopt = useCallback((s: ProjectState) => setState({ ...s, busy: null }), []);
  const showToast = useCallback((text: string, err = false) => {
    setToast({ text, err });
    window.setTimeout(() => setToast(null), err ? 4200 : 2600);
  }, []);

  // ---------- events ----------
  useEffect(() => {
    return hub.on((e: HubEvent) => {
      if (e.type === 'hello') {
        setConnected(true);
        setProjects(e.projects as Project[]);
        return;
      }
      if (e.type === 'busy' && e.projectId === '') {
        setConnected(true);
        hub.rpc<Project[]>('projects.list').then(setProjects).catch(() => undefined);
        return;
      }
      if (projectId && e.projectId && e.projectId !== projectId) return;
      switch (e.type) {
        case 'state':
          setState(e.state);
          break;
        case 'busy':
          // The state event is sent before the engine clears its busy flag, so mirror it here.
          setState((s) => (s ? { ...s, busy: e.what } : s));
          if (e.what) say(`${e.what}…`, true);
          else setLive((l) => (l.text.endsWith('…') ? { text: 'Ready', on: false } : l));
          break;
        case 'error':
          showToast(e.message, true);
          say('Ready');
          break;
        case 'version.committed':
          showToast(`v${e.number} committed · Mog score ${Math.round(e.score)}`);
          say(`v${e.number} is the current version. v1 stays viewable read-only.`);
          break;
        case 'pass.stale':
          showToast(`${e.passIds.length} downstream pass${e.passIds.length > 1 ? 'es' : ''} marked stale`);
          break;
        default:
          break;
      }
    });
  }, [hub, projectId, say, showToast]);

  // Score delta: fade after 1.6s, like the mockup.
  useEffect(() => {
    const s = state?.score?.score ?? null;
    if (s === null) return;
    if (lastScore.current !== null && s !== lastScore.current) setDelta({ n: s - lastScore.current, key: Date.now() });
    lastScore.current = s;
  }, [state?.score?.score]);
  useEffect(() => {
    if (!delta) return;
    const t = window.setTimeout(() => setDelta(null), 1600);
    return () => window.clearTimeout(t);
  }, [delta]);

  // Pick the first project once the hub says hello.
  useEffect(() => {
    if (projectId || !projects.length) return;
    const first = projects[0];
    setField(first.rootPath);
    void loadProject(first.id);
  }, [projects]);

  const loadProject = useCallback(
    async (id: string) => {
      setProjectId(id);
      try {
        const s = await hub.rpc<ProjectState>('project.load', { project_id: id });
        adopt(s);
        setField(s.project.rootPath);
        if (!s.brief) say('Start with the story: what this is, who it is for, and what a visitor should do.');
        else if (!s.audited) {
          say('Planning from the story…', true);
          const audited = await hub.rpc<ProjectState>('audit_page', { project_id: id });
          adopt(audited);
          say(`Mog score ${audited.score?.score ?? '–'}. Start with a direction, then refine.`);
        } else say(`Mog score ${s.score?.score ?? '–'}. Hover a row to preview it live.`);
      } catch (e) {
        showToast((e as Error).message, true);
      }
    },
    [hub, say, showToast],
  );

  const call = useCallback(
    async <T,>(method: string, params: Record<string, unknown> = {}): Promise<T | undefined> => {
      if (!projectId) return undefined;
      try {
        return await hub.rpc<T>(method, { project_id: projectId, ...params });
      } catch (e) {
        showToast((e as Error).message, true);
        return undefined;
      }
    },
    [hub, projectId, showToast],
  );

  // ---------- actions ----------
  const maxxIt = useCallback(async () => {
    if (mode === 'url') {
      setRecreating(true);
      say(`Recreating ${field || 'the site'} as code…`, true);
      return;
    }
    const existing = projects.find((p) => p.rootPath === field || p.name === field);
    try {
      say('Registering the project…', true);
      const r = existing ? { projectId: existing.id } : await hub.rpc<{ projectId: string }>('init_project', { path: field });
      setProjectId(r.projectId);
      setProjects(await hub.rpc<Project[]>('projects.list'));
      const loaded = await hub.rpc<ProjectState>('project.load', { project_id: r.projectId });
      adopt(loaded);
      if (!loaded.brief) {
        say('Start with the story: what this is, who it is for, and what a visitor should do.');
        return;
      }
      say('Planning from the story…', true);
      const s = await hub.rpc<ProjectState>('audit_page', { project_id: r.projectId });
      adopt(s);
      say(`Mog score ${s.score?.score ?? '–'}. Start with a direction, then refine.`);
    } catch (e) {
      showToast((e as Error).message, true);
      say('Ready');
    }
  }, [mode, field, projects, hub, say, showToast]);

  const passById = useCallback((id: string) => state?.passes.find((p) => p.id === id), [state]);

  const preview = useCallback(
    async (passId: string | null, variantId?: string) => {
      if (!state) return;
      if (!passId) {
        if (state.previewing) await call('end_preview');
        return;
      }
      const p = passById(passId);
      if (!p || p.status === 'committed' || p.status === 'skipped') return;
      hoverStart.current[passId] = hoverStart.current[passId] ?? Date.now();
      const v = p.variants.find((x) => x.id === (variantId ?? p.chosenVariantId));
      say(`Previewing <b>${p.name}${v ? ': ' + v.label : ''}</b>`, true);
      await call('preview_pass', { pass_id: passId, variant_id: variantId, shown_alongside: state.passes.filter((x) => x.kind === p.kind && x.id !== passId).map((x) => x.id) });
    },
    [state, call, passById, say],
  );

  const hoverRow = useCallback(
    (passId: string | null) => {
      if (playingRef.current) return;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => {
        if (passId) hoverStart.current[passId] = Date.now();
        void preview(passId);
        if (!passId) say('Ready');
      }, passId ? 90 : 160);
    },
    [preview, say],
  );

  const dwell = (passId: string) => (hoverStart.current[passId] ? Date.now() - hoverStart.current[passId] : undefined);

  const decide = useCallback(
    async (passId: string, action: 'approve' | 'reject' | 'pick' | 'regenerate', variantId?: string) => {
      const p = passById(passId);
      if (!p) return;
      const s = await call<ProjectState>('decide_pass', { pass_id: passId, action, variant_id: variantId, dwell_ms: dwell(passId) });
      if (!s) return;
      const np = s.passes.find((x) => x.id === passId)!;
      const v = np.variants.find((x) => x.id === np.chosenVariantId);
      if (action === 'pick') say(`Picked <b>${v?.label ?? variantId}</b> for ${np.name}`, true);
      else if (action === 'regenerate') say(`${np.name} regenerated`);
      else say(`${np.name}${v ? ' (' + v.label + ')' : ''} ${np.status === 'proposed' ? 'reset' : np.status}`);
      if (action === 'reject' && np.status !== 'rejected') setReasons((r) => ({ ...r, [passId]: undefined }));
    },
    [call, passById, say],
  );

  const setReason = useCallback(
    async (passId: string, chip: ReasonChip) => {
      setReasons((r) => ({ ...r, [passId]: r[passId] === chip ? undefined : chip }));
      await call('reject_reason', { pass_id: passId, reason_chip: chip });
    },
    [call],
  );

  const playAll = useCallback(async () => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      await preview(null);
      say('Stopped');
      return;
    }
    if (!state) return;
    playingRef.current = true;
    setPlaying(true);
    for (const p of state.passes) {
      if (!playingRef.current) break;
      if (p.status !== 'proposed') continue;
      document.getElementById('row-' + p.id)?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      if (p.variants.length) {
        for (const v of p.variants) {
          if (!playingRef.current) break;
          await preview(p.id, v.id);
          await wait(p.defId === 'hero-art' ? 2800 : 2000);
        }
      } else {
        await preview(p.id);
        await wait(p.defId === 'copy' ? 3400 : 1900);
      }
    }
    playingRef.current = false;
    setPlaying(false);
    await preview(null);
    say('Ready');
  }, [state, preview, say]);

  const approveAll = useCallback(async () => {
    await call('approve_all');
    say('All proposed changes approved');
  }, [call, say]);

  const reset = useCallback(async () => {
    say('Auditing the page…', true);
    const s = await call<ProjectState>('audit_page');
    if (s) say(`Mog score ${s.score?.score ?? '–'}. Start with a direction, then refine.`);
    setReasons({});
  }, [call, say]);

  const saveStory = useCallback(
    async (d: StoryDraft) => {
      say('Reading the story…', true);
      const s = await call<ProjectState>('set_brief', { brief: d });
      if (!s) return;
      adopt(s);
      setEditingStory(false);
      setReasons({});
      say('Planning from the story…', true);
      const planned = await call<ProjectState>('audit_page');
      if (planned) {
        adopt(planned);
        const n = planned.passes.filter((p) => p.status === 'proposed').length;
        say(`Planned ${n} changes for ${planned.brief?.goal ?? 'this goal'}. Start with a direction, then refine.`);
      }
    },
    [call, adopt, say],
  );

  const reroll = useCallback(
    async (passId?: string) => {
      const p = passId ? passById(passId) : undefined;
      say(p ? `Re-rolling <b>${p.name}</b>…` : 'Randomizing every open pass…', true);
      const s = await call<ProjectState>('reroll_pass', passId ? { pass_id: passId } : {});
      if (s) {
        adopt(s);
        say(p ? `New options for <b>${p.name}</b>` : 'New options for every open pass. Approved ones stay.');
      }
    },
    [call, adopt, passById, say],
  );

  const commit = useCallback(async () => {
    say('Committing…', true);
    await call('commit_version');
  }, [call, say]);

  const setView = useCallback(
    async (view: 'current' | 'changes') => {
      await call('set_view', { view });
      say(view === 'current' ? `Showing <b>v${state?.currentVersion ?? 1}</b> without pending changes` : 'Showing pending changes');
    },
    [call, say, state?.currentVersion],
  );

  const viewVersion = useCallback(
    async (n: number) => {
      if (!state) return;
      if (n === state.currentVersion) {
        await call('view_version', { number: null });
        say('Viewing current version');
        return;
      }
      say(`Checking out v${n}…`, true);
      const r = await call<{ url: string | null }>('view_version', { number: n });
      if (r) say(`Viewing <b>v${n}</b> (read-only)`);
    },
    [state, call, say],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const rows = state.passes.filter((p) => p.status !== 'skipped');
      const idx = rows.findIndex((p) => p.id === selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = rows[Math.max(0, Math.min(rows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) {
          setSelected(next.id);
          document.getElementById('row-' + next.id)?.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if (!selected) return;
      const p = passById(selected);
      if (!p) return;
      if (e.key === ' ') {
        e.preventDefault();
        void preview(state.previewing?.passId === selected ? null : selected);
      } else if (e.key === 'a' || e.key === 'A') void decide(selected, 'approve');
      else if (e.key === 'r' || e.key === 'R') void decide(selected, 'reject');
      else if (e.key === 'c' || e.key === 'C') void commit();
      else if (e.key === 'd' || e.key === 'D') void reroll(selected);
      else if (/^[1-5]$/.test(e.key)) {
        const v = p.variants[Number(e.key) - 1];
        if (v) void decide(selected, 'pick', v.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, selected, passById, preview, decide, commit, reroll]);

  const approvedCount = state?.passes.filter((p) => p.status === 'approved').length ?? 0;

  return (
    <>
      <TopBar
        mode={mode}
        onMode={(m) => {
          setMode(m);
          setField(m === 'url' ? 'https://example.com' : (state?.project.rootPath ?? projects[0]?.rootPath ?? ''));
          if (m === 'repo') setRecreating(false);
        }}
        field={field}
        onField={setField}
        projects={projects}
        onSubmit={maxxIt}
        state={state}
        delta={delta}
        approvedCount={approvedCount}
        onCommit={commit}
        connected={connected}
      />
      <main className="main">
        <section className="stage" aria-label="Live preview">
          <StepRail state={state} recreating={recreating} mode={mode} />
          <div className="stagebar">
            <div className="seg" role="group" aria-label="Compare">
              <button aria-pressed={state?.view === 'current' && !state?.viewingVersion} onClick={() => setView('current')}>
                Current v{state?.currentVersion ?? 1}
              </button>
              <button aria-pressed={state?.view === 'changes' && !state?.viewingVersion} onClick={() => setView('changes')}>
                With changes
              </button>
            </div>
            <div className="live">
              <span className={'dot' + (live.on || state?.busy ? ' on' : '')} />
              <span dangerouslySetInnerHTML={{ __html: state?.busy ? `${state.busy}…` : live.text }} />
            </div>
          </div>
          <Stage state={state} mode={mode} field={field} recreating={recreating} onRecreated={() => setRecreating(false)} />
        </section>
        <Queue
          state={state}
          playing={playing}
          selected={selected}
          reasons={reasons}
          onSelect={setSelected}
          onHover={hoverRow}
          onHoverVariant={(passId, variantId) => {
            if (playingRef.current) return;
            if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
            // Leaving a thumbnail falls back to the chosen variant only if no other thumbnail is
            // entered right away, so sliding across thumbnails previews each one exactly once.
            if (variantId) void preview(passId, variantId);
            else hoverTimer.current = window.setTimeout(() => void preview(passId), 140);
          }}
          onPreviewClick={(id) => void preview(state?.previewing?.passId === id ? null : id)}
          onDecide={decide}
          onReason={setReason}
          onPlay={playAll}
          onApproveAll={approveAll}
          onReset={reset}
          onVersion={viewVersion}
          onReroll={reroll}
          editingStory={editingStory || !!(state && !state.brief)}
          onEditStory={() => setEditingStory(true)}
          onCancelStory={state?.brief ? () => setEditingStory(false) : undefined}
          onSaveStory={saveStory}
          rpc={(m, p) => hub.rpc(m, p)}
        />
      </main>
      <div className={'toast' + (toast ? ' show' : '') + (toast?.err ? ' err' : '')} role="status">
        {toast?.text}
      </div>
    </>
  );
}

export type { PassView };
