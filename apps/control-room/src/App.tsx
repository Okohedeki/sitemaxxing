import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HubEvent, ProjectState, PassView, ReasonChip } from '@sitemaxxing/core/protocol';
import { HubClient, hubUrl } from './hub';
import { TopBar } from './components/TopBar';
import { Welcome } from './components/Welcome';
import { StepRail } from './components/StepRail';
import { Stage, type RecreateState } from './components/Stage';
import { guideOf, type GuideAction } from './guide';
import { Queue } from './components/Queue';
import { System } from './components/System';
import type { StoryDraft } from './components/StoryForm';

export interface Project {
  id: string;
  name: string;
  devUrl: string;
  rootPath: string;
  loaded: boolean;
  /** The page a recreated project came from. */
  source: string | null;
}

const store = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 200) : ms));

export function App() {
  const hub = useMemo(() => new HubClient(hubUrl), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [state, setState] = useState<ProjectState | null>(null);
  /** Home is the welcome screen; work is a project open in the workspace. */
  const [screen, setScreen] = useState<'home' | 'work'>('home');
  const [live, setLive] = useState<{ text: string; on: boolean }>({
    text: 'Connecting to the hub…',
    on: false,
  });
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [recreate, setRecreate] = useState<RecreateState | null>(null);
  const [stageView, setStageView] = useState<'page' | 'system'>('page');
  const [guided, setGuidedState] = useState(() => store.get('sm.guided') !== 'off');
  const setGuided = useCallback((on: boolean) => {
    setGuidedState(on);
    store.set('sm.guided', on ? 'on' : 'off');
  }, []);
  const [lastSkipped, setLastSkipped] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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
      if (e.type === 'recreate.step') {
        if (e.what) setRecreate((r) => (r && !r.error ? { ...r, current: e.what } : r));
        return;
      }
      if (e.type === 'busy' && e.projectId === '') {
        setConnected(true);
        hub
          .rpc<Project[]>('projects.list')
          .then(setProjects)
          .catch(() => undefined);
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
          showToast(
            `${e.passIds.length} downstream pass${e.passIds.length > 1 ? 'es' : ''} marked stale`,
          );
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
    if (lastScore.current !== null && s !== lastScore.current)
      setDelta({ n: s - lastScore.current, key: Date.now() });
    lastScore.current = s;
  }, [state?.score?.score]);
  useEffect(() => {
    if (!delta) return;
    const t = window.setTimeout(() => setDelta(null), 1600);
    return () => window.clearTimeout(t);
  }, [delta]);

  const loadProject = useCallback(
    async (id: string) => {
      setProjectId(id);
      setScreen('work');
      setSelected(null);
      setEditingStory(false);
      try {
        const s = await hub.rpc<ProjectState>('project.load', { project_id: id });
        adopt(s);
        if (!s.brief)
          say('Start with the story: what this is, who it is for, and what a visitor should do.');
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
  /** Any URL: rebuild a public page as code (or reopen it if it was rebuilt before). */
  const startUrl = useCallback(
    async (input: string) => {
      const norm = (u: string) => {
        try {
          return new URL(/^[a-z]+:\/\//i.test(u) ? u : `https://${u}`).href.replace(/\/$/, '');
        } catch {
          return u;
        }
      };
      const known = projects.find((p) => p.source && norm(p.source) === norm(input));
      if (known) return loadProject(known.id);
      setScreen('work');
      setState(null);
      setProjectId(null);
      setRecreate({ url: input, current: 'Opening the page' });
      say(`Rebuilding ${input} as code…`, true);
      try {
        const r = await hub.rpc<{ projectId: string; url: string }>('recreate_url', { url: input });
        setProjects(await hub.rpc<Project[]>('projects.list'));
        await loadProject(r.projectId);
        setRecreate(null);
        say(
          'v1 is saved. Now tell the story: what this is, who it is for, and what a visitor should do.',
        );
      } catch (e) {
        setRecreate((x) => ({ url: x?.url ?? input, current: null, error: (e as Error).message }));
        say('Ready');
      }
    },
    [projects, hub, say, loadProject],
  );

  /** My repo: register a local project folder whose dev server is running. */
  const openFolder = useCallback(
    async (folder: string) => {
      const existing = projects.find((p) => p.rootPath === folder || p.name === folder);
      try {
        say('Opening the project…', true);
        const r = existing
          ? { projectId: existing.id }
          : await hub.rpc<{ projectId: string }>('init_project', { path: folder });
        setProjects(await hub.rpc<Project[]>('projects.list'));
        await loadProject(r.projectId);
      } catch (e) {
        showToast((e as Error).message, true);
        say('Ready');
      }
    },
    [projects, hub, say, showToast, loadProject],
  );

  const goHome = useCallback(async () => {
    if (state?.previewing)
      await hub.rpc('end_preview', { project_id: state.project.id }).catch(() => undefined);
    setScreen('home');
    setRecreate(null);
    hub
      .rpc<Project[]>('projects.list')
      .then(setProjects)
      .catch(() => undefined);
  }, [hub, state]);

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
      await call('preview_pass', {
        pass_id: passId,
        variant_id: variantId,
        shown_alongside: state.passes
          .filter((x) => x.kind === p.kind && x.id !== passId)
          .map((x) => x.id),
      });
    },
    [state, call, passById, say],
  );

  const hoverRow = useCallback(
    (passId: string | null) => {
      if (playingRef.current) return;
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(
        () => {
          if (passId) hoverStart.current[passId] = Date.now();
          void preview(passId);
          if (!passId) say('Ready');
        },
        passId ? 90 : 160,
      );
    },
    [preview, say],
  );

  const dwell = (passId: string) =>
    hoverStart.current[passId] ? Date.now() - hoverStart.current[passId] : undefined;

  const decide = useCallback(
    async (
      passId: string,
      action: 'approve' | 'reject' | 'pick' | 'regenerate',
      variantId?: string,
    ) => {
      const p = passById(passId);
      if (!p) return;
      const s = await call<ProjectState>('decide_pass', {
        pass_id: passId,
        action,
        variant_id: variantId,
        dwell_ms: dwell(passId),
      });
      if (!s) return;
      const np = s.passes.find((x) => x.id === passId)!;
      if (action === 'reject') setLastSkipped(np.baseStatus === 'rejected' ? passId : null);
      else if (action !== 'pick') setLastSkipped(null);
      const v = np.variants.find((x) => x.id === np.chosenVariantId);
      if (action === 'pick') say(`Picked <b>${v?.label ?? variantId}</b> for ${np.name}`, true);
      else if (action === 'regenerate') say(`${np.name} regenerated`);
      else
        say(
          `${np.name}${v ? ' (' + v.label + ')' : ''} ${np.status === 'proposed' ? 'reset' : np.status}`,
        );
    },
    [call, passById, say],
  );

  const setReason = useCallback(
    async (passId: string, chip: ReasonChip) => {
      window.setTimeout(() => setLastSkipped((x) => (x === passId ? null : x)), 1400);
      const p = passById(passId);
      const next = p?.reason === chip ? null : chip;
      const s = await call<ProjectState>('reject_reason', { pass_id: passId, reason_chip: next });
      if (!s) return;
      adopt(s);
      const lean = s.passes.find((x) => x.id === passId)?.lean ?? [];
      if (next && lean.length)
        say(
          `Noted. The next roll of ${p?.name ?? 'this pass'} leans <b>${lean.join(', ')}</b>`,
          true,
        );
    },
    [adopt, call, passById, say],
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
      document
        .getElementById('row-' + p.id)
        ?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
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
  }, [call, say]);

  const saveStory = useCallback(
    async (d: StoryDraft) => {
      say('Reading the story…', true);
      const s = await call<ProjectState>('set_brief', { brief: d });
      if (!s) return;
      adopt(s);
      setEditingStory(false);
      say('Planning from the story…', true);
      const planned = await call<ProjectState>('audit_page');
      if (planned) {
        adopt(planned);
        const n = planned.passes.filter((p) => p.status === 'proposed').length;
        say(
          `Planned ${n} changes for ${planned.brief?.goal ?? 'this goal'}. Start with a direction, then refine.`,
        );
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
        say(
          p
            ? `New options for <b>${p.name}</b>`
            : 'New options for every open pass. Approved ones stay.',
        );
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
      say(
        view === 'current'
          ? `Showing <b>v${state?.currentVersion ?? 1}</b> without pending changes`
          : 'Showing pending changes',
      );
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

  // ---------- guide ----------
  const guide = useMemo(
    () => guideOf(state, selected, !!recreate && !recreate.error),
    [state, selected, recreate],
  );
  const focusId = guide.focus?.id ?? null;

  // The tab says where you are.
  useEffect(() => {
    if (screen === 'home') return;
    if (!state && !recreate) {
      document.title = 'Sitemaxxing';
      return;
    }
    const names = ['Rebuilding', 'Story', 'Direction', 'Refine', 'Save', 'Saved'];
    let where = state?.project.name ?? '';
    try {
      if (state?.source) where = new URL(state.source).host;
    } catch {
      /* keep the project name */
    }
    document.title = [
      names[editingStory || (state && !state.brief) ? 1 : guide.step],
      where,
      'Sitemaxxing',
    ]
      .filter(Boolean)
      .join(' · ');
  }, [
    screen,
    guide.step,
    state?.source,
    state?.project.name,
    editingStory,
    state?.brief,
    recreate,
  ]);

  // The page always shows the change in focus, so every decision is made looking at it.
  useEffect(() => {
    if (!guided || playingRef.current || !state?.audited || state.viewingVersion) return;
    const t = window.setTimeout(() => void preview(focusId), 120);
    return () => window.clearTimeout(t);
  }, [guided, focusId, state?.audited]);

  // A change made stale by an earlier decision is rebuilt on the spot, so the guide never stops
  // to ask for a chore.
  const regenerated = useRef(new Set<string>());
  useEffect(() => {
    const f = guide.focus;
    if (
      !guided ||
      !f ||
      f.baseStatus !== 'stale' ||
      state?.busy ||
      regenerated.current.has(f.id + f.seed)
    )
      return;
    regenerated.current.add(f.id + f.seed);
    void decide(f.id, 'regenerate');
  }, [guided, guide.focus, state?.busy]);

  const guideAction = useCallback(
    async (a: GuideAction) => {
      const f = guide.focus;
      if (a === 'keep' && f) await decide(f.id, 'approve');
      else if (a === 'skip' && f) await decide(f.id, 'reject');
      else if (a === 'regenerate' && f) await decide(f.id, 'regenerate');
      else if (a === 'reroll' && f) await reroll(f.id);
      else if (a === 'commit') await commit();
      else if (a === 'randomize') await reroll();
      else if (a === 'story') setEditingStory(true);
      if (a === 'keep' || a === 'skip') setSelected(null);
    },
    [guide.focus, decide, reroll, commit],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (guided && !editingStory) {
        const f = guide.focus;
        if (e.key === 'Enter' && guide.primary && tag !== 'BUTTON') {
          e.preventDefault();
          void guideAction(guide.primary.action);
        } else if ((e.key === 's' || e.key === 'S') && f) void guideAction('skip');
        else if ((e.key === 'd' || e.key === 'D') && f) void guideAction('reroll');
        else if (/^[1-5]$/.test(e.key) && f?.variants[Number(e.key) - 1])
          void decide(f.id, 'pick', f.variants[Number(e.key) - 1].id);
        return;
      }
      const rows = state.passes.filter((p) => p.status !== 'skipped');
      const idx = rows.findIndex((p) => p.id === selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next =
          rows[Math.max(0, Math.min(rows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
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
  }, [
    state,
    selected,
    passById,
    preview,
    decide,
    commit,
    reroll,
    guided,
    editingStory,
    guide,
    guideAction,
  ]);

  const approvedCount = state?.passes.filter((p) => p.status === 'approved').length ?? 0;

  const mode: 'url' | 'repo' = recreate || state?.source ? 'url' : 'repo';
  const toastEl = (
    <div className={'toast' + (toast ? ' show' : '') + (toast?.err ? ' err' : '')} role="status">
      {toast?.text}
    </div>
  );

  if (screen === 'home') {
    return (
      <>
        <Welcome
          projects={projects}
          connected={connected}
          onStartUrl={(u) => void startUrl(u)}
          onOpenFolder={(f) => void openFolder(f)}
          onOpen={(id) => void loadProject(id)}
        />
        {toastEl}
      </>
    );
  }

  return (
    <>
      <TopBar
        state={recreate ? null : state}
        delta={delta}
        approvedCount={approvedCount}
        rail={
          <StepRail step={editingStory || (state && !state.brief) ? 1 : guide.step} mode={mode} />
        }
        onCommit={commit}
        onHome={() => void goHome()}
      />
      <main className="main">
        <section className="stage" aria-label="Live preview">
          <div className="stagebar">
            <div className="seg" role="group" aria-label="Show">
              <button
                aria-pressed={stageView === 'page' || !!recreate}
                onClick={() => setStageView('page')}
              >
                Page
              </button>
              <button
                aria-pressed={stageView === 'system' && !recreate}
                disabled={!!recreate}
                onClick={() => setStageView('system')}
              >
                System
              </button>
            </div>
            <div className="seg" role="group" aria-label="Compare">
              <button
                aria-pressed={state?.view === 'current' && !state?.viewingVersion}
                onClick={() => setView('current')}
              >
                Current v{state?.currentVersion ?? 1}
              </button>
              <button
                aria-pressed={state?.view === 'changes' && !state?.viewingVersion}
                onClick={() => setView('changes')}
              >
                With changes
              </button>
            </div>
            <div className="live">
              <span className={'dot' + (live.on || state?.busy ? ' on' : '')} />
              <span
                dangerouslySetInnerHTML={{ __html: state?.busy ? `${state.busy}…` : live.text }}
              />
            </div>
          </div>
          {stageView === 'system' && !recreate ? (
            <System state={state} />
          ) : (
            <Stage
              state={recreate && !recreate.error ? null : state}
              recreate={recreate}
              onCloseRecreate={() => setRecreate(null)}
            />
          )}
        </section>
        <Queue
          state={state}
          playing={playing}
          selected={selected}
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
          guide={guide}
          guided={guided}
          onGuided={setGuided}
          onGuideAction={(a) => void guideAction(a)}
          lastSkipped={lastSkipped ? (passById(lastSkipped) ?? null) : null}
        />
      </main>
      <div className={'toast' + (toast ? ' show' : '') + (toast?.err ? ' err' : '')} role="status">
        {toast?.text}
      </div>
    </>
  );
}

export type { PassView };
