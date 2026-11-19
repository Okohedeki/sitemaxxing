import { useEffect, useState } from 'react';
import type { PassView, ProjectState, ReasonChip } from '@sitemaxxing/core/protocol';
import { REASON_CHIPS, describeMood } from '@sitemaxxing/core/protocol';
import { StoryCard, StoryForm, type StoryDraft } from './StoryForm';
import { guidedPasses, type Guide, type GuideAction } from '../guide';

const icons = {
  eye: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
  ok: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  ),
  no: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  dice: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />
      <circle cx="5.6" cy="5.6" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="10.4" r=".9" fill="currentColor" stroke="none" />
    </svg>
  ),
};

interface RuleCard {
  id: string;
  principle: string;
  fix: string;
  source: { title: string; author: string; url: string };
}

/** Every option says why it is there (a bold one needs its story beside it). */
const SLOT_WHY: Record<string, string> = {
  fit: 'Closest to your story',
  stretch: 'One step further',
  wildcard: 'Far out, on purpose',
};

function chipFor(p: PassView, current: number): [string, string] {
  // A decision outranks a hover: an approved or rejected row stays labelled while it is previewed.
  const status = p.status === 'previewing' && ['approved', 'rejected'].includes(p.baseStatus) ? p.baseStatus : p.status;
  switch (status) {
    case 'previewing':
      return ['previewing', 'Previewing'];
    case 'approved':
      return ['approved', 'Approved'];
    case 'rejected':
      return ['rejected', 'Rejected'];
    case 'stale':
      return ['stale', 'Stale'];
    case 'committed':
      return ['committed', `In v${current}`];
    case 'skipped':
      return ['', 'Skipped'];
    default:
      return ['', 'Proposed'];
  }
}

function Row(props: {
  p: PassView;
  index: number;
  current: number;
  selected: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
  onHoverVariant: (passId: string, variantId: string | null) => void;
  onPreviewClick: () => void;
  onDecide: (action: 'approve' | 'reject' | 'pick' | 'regenerate', variantId?: string) => void;
  onReason: (chip: ReasonChip) => void;
  onReroll: () => void;
  rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  /** Shown inside the guide card: no number, title or action column of its own. */
  guided?: boolean;
}) {
  const { p } = props;
  const [why, setWhy] = useState<RuleCard[] | null>(null);
  const [enter, setEnter] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setEnter(false), 60 + props.index * 90);
    return () => window.clearTimeout(t);
  }, [props.index]);
  const [cls, label] = chipFor(p, props.current);
  const locked = p.status === 'committed' || p.status === 'skipped';
  const loadWhy = async () => {
    if (why) return setWhy(null);
    const cards = (await Promise.all(p.ruleCards.map((id) => props.rpc('rule_card', { id })))) as (RuleCard | null)[];
    setWhy(cards.filter(Boolean) as RuleCard[]);
  };
  return (
    <li
      id={'row-' + p.id}
      className={['item', enter ? 'enter' : '', p.baseStatus === 'rejected' ? 'rejected' : '', p.status === 'previewing' ? 'previewing' : '', p.status === 'skipped' ? 'skipped' : '', props.selected ? 'selected' : ''].join(' ')}
      onMouseEnter={() => !locked && !props.guided && props.onHover(p.id)}
      onMouseLeave={() => !locked && !props.guided && props.onHover(null)}
      onClick={props.onSelect}
    >
      {props.guided ? null : <span className="num">{String(props.index + 1).padStart(2, '0')}</span>}
      <div>
        {props.guided ? null : (
        <h3>
          <span className="t">{p.name}</span>
          <span className={'chip ' + cls}>{label}</span>
          {p.status !== 'skipped' ? (
            <span className="fit" role="img" aria-label={`Matters ${p.impact} out of 100 for this story`} title={`How much this matters for this story: ${p.impact}/100`}>
              <i style={{ width: `${Math.max(6, p.impact)}%` }} />
            </span>
          ) : null}
          {p.ruleCards.length ? (
            <button
              className="why"
              onClick={(e) => {
                e.stopPropagation();
                void loadWhy();
              }}
            >
              why?
            </button>
          ) : null}
        </h3>
        )}
        <p>{p.status === 'skipped' ? `Skipped: ${p.skipReason ?? 'already fine'}` : (p.summary ?? p.description)}</p>
        {p.status !== 'skipped' && p.rationale && !props.guided ? <p className="rationale">{p.rationale}</p> : null}
        {p.status === 'stale' ? (
          <div className="reasons">
            <button className="btn small" onClick={(e) => (e.stopPropagation(), props.onDecide('regenerate'))}>
              Regenerate
            </button>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>An upstream pass changed; this one needs a fresh patch.</span>
          </div>
        ) : null}
        {p.copyDiff?.length ? (
          <div className="diff">
            {p.copyDiff.slice(0, 4).map((c) => (
              <div key={c.key}>
                <del>{c.old}</del> → <ins>{c.new}</ins>
              </div>
            ))}
          </div>
        ) : null}
        {p.variants.length ? (
          <div className="variants">
            {p.variants.map((v) => (
              <button
                key={v.id}
                aria-pressed={p.chosenVariantId === v.id}
                aria-label={`${p.name}: ${v.label}`}
                disabled={locked}
                onMouseEnter={() => props.onHoverVariant(p.id, v.id)}
                onMouseLeave={() => props.onHoverVariant(p.id, null)}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onDecide('pick', v.id);
                }}
              >
                <span dangerouslySetInnerHTML={{ __html: v.thumbnail }} />
                {v.label.includes(' · ') ? (
                  <>
                    <small className={'slot slot-' + String(v.attributes?.slot ?? '')}>{v.label.split(' · ')[0]}</small>
                    <span>{v.label.split(' · ').slice(1).join(' · ')}</span>
                    {SLOT_WHY[String(v.attributes?.slot ?? '')] ? <span className="why-slot">{SLOT_WHY[String(v.attributes?.slot)]}</span> : null}
                  </>
                ) : (
                  <span>{v.label}</span>
                )}
              </button>
            ))}
          </div>
        ) : null}
        {p.baseStatus === 'rejected' && !props.guided ? (
          <div className="reasons" aria-label="Why not?">
            {REASON_CHIPS.map((c) => (
              <button key={c} aria-pressed={p.reason === c} onClick={(e) => (e.stopPropagation(), props.onReason(c))}>
                {c}
              </button>
            ))}
          </div>
        ) : null}
        {p.reason && p.lean.length && !locked && !props.guided ? (
          <div className="lean">
            <span>
              Next roll leans <b>{p.lean.join(', ')}</b>
            </span>
            <button className="btn small" onClick={(e) => (e.stopPropagation(), props.onReroll())}>
              Roll it
            </button>
          </div>
        ) : null}
        {p.findings.length && p.status !== 'skipped' ? (
          <ul className="findings">
            {p.findings.slice(0, 3).map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        ) : null}
        {why ? (
          <div className="cards">
            {why.map((c) => (
              <div className="card" key={c.id}>
                <b>{c.principle}</b>
                <p>{c.fix}</p>
                <a href={c.source.url} target="_blank" rel="noreferrer">
                  {c.source.title} · {c.source.author}
                </a>
              </div>
            ))}
          </div>
        ) : null}
        {props.guided && p.ruleCards.length ? (
          <button className="why" onClick={(e) => (e.stopPropagation(), void loadWhy())}>
            {why ? 'hide the why' : 'why this?'}
          </button>
        ) : null}
      </div>
      {props.guided ? null : (
      <div className="acts">
        <button className="ib dice" title="Re-roll: new options for this pass (D)" aria-label={`Re-roll ${p.name}`} disabled={locked} onClick={(e) => (e.stopPropagation(), props.onReroll())}>
          {icons.dice}
        </button>
        <button className="ib pv" title="Preview" aria-label={`Preview ${p.name}`} disabled={locked} onClick={(e) => (e.stopPropagation(), props.onPreviewClick())}>
          {icons.eye}
        </button>
        <button className="ib ok" title="Approve" aria-label={`Approve ${p.name}`} aria-pressed={p.status === 'approved' || p.status === 'committed'} disabled={locked || p.status === 'stale'} onClick={(e) => (e.stopPropagation(), props.onDecide('approve'))}>
          {icons.ok}
        </button>
        <button className="ib no" title="Reject" aria-label={`Reject ${p.name}`} aria-pressed={p.baseStatus === 'rejected'} disabled={locked} onClick={(e) => (e.stopPropagation(), props.onDecide('reject'))}>
          {icons.no}
        </button>
      </div>
      )}
    </li>
  );
}

export function Queue(props: {
  state: ProjectState | null;
  playing: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHoverVariant: (passId: string, variantId: string | null) => void;
  onPreviewClick: (id: string) => void;
  onDecide: (id: string, action: 'approve' | 'reject' | 'pick' | 'regenerate', variantId?: string) => void;
  onReason: (id: string, chip: ReasonChip) => void;
  onPlay: () => void;
  onApproveAll: () => void;
  onReset: () => void;
  onVersion: (n: number) => void;
  onReroll: (passId?: string) => void;
  editingStory: boolean;
  onEditStory: () => void;
  onCancelStory?: () => void;
  onSaveStory: (d: StoryDraft) => void;
  rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  guide: Guide;
  guided: boolean;
  onGuided: (on: boolean) => void;
  onGuideAction: (a: GuideAction) => void;
  lastSkipped: PassView | null;
}) {
  const { state } = props;
  if (state && props.editingStory) {
    return (
      <aside className="panel" aria-label="Story">
        <StoryForm brief={state.brief} suggested={state.suggestedBrief} source={state.source} busy={!!state.busy} onSubmit={props.onSaveStory} onCancel={props.onCancelStory} />
      </aside>
    );
  }
  if (props.guided) return <GuidedPanel {...props} />;
  const passes = state?.passes ?? [];
  const open = passes.filter((p) => p.status !== 'skipped');
  const groups: Array<[string, PassView[]]> = [
    ['Step 2 · Pick a direction', open.filter((p) => p.kind === 'direction')],
    ['Step 3 · Refine', open.filter((p) => p.kind === 'refine')],
    ['Step 3 · Components and sections', open.filter((p) => p.kind === 'component')],
    ['Left out for this story', passes.filter((p) => p.status === 'skipped')],
  ];
  const approved = passes.filter((p) => p.status === 'approved').length;
  const rejected = passes.filter((p) => p.status === 'rejected').length;
  const active = state?.viewingVersion ?? state?.currentVersion ?? 1;
  let n = 0;
  return (
    <aside className="panel" aria-label="Change queue">
      <div className="phead">
        <div className="row">
          <h2>Change queue</h2>
          <span className="counts">
            {passes.filter((p) => p.status !== 'skipped').length} found · {approved} approved · {rejected} rejected
          </span>
        </div>
        <div className="row">
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={props.onPlay} disabled={!state?.audited}>
              {props.playing ? 'Stop' : 'Play all live'}
            </button>
            <button className="btn dicebtn" onClick={() => props.onReroll()} disabled={!state?.audited || !!state?.busy} title="New options for every open pass; approved ones stay">
              {icons.dice} Randomize
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => props.onGuided(true)} title="One decision at a time">
              Guide me
            </button>
            <button className="btn" onClick={props.onApproveAll} disabled={!state?.audited}>
              Approve all
            </button>
            <button className="btn" onClick={props.onReset} disabled={!state}>
              Reset
            </button>
          </div>
        </div>
      </div>
      {state?.brief ? <StoryCard brief={state.brief} mood={state.mood ? describeMood(state.mood) : []} onEdit={props.onEditStory} /> : null}
      <ul className="list">
        {!state?.audited ? <li className="item skipped">{state ? 'Auditing…' : 'Waiting for a project…'}</li> : null}
        {groups.map(([title, items]) =>
          items.length ? (
            <GroupRows key={title} title={title}>
              {items.map((p) => (
                <Row
                  key={p.id}
                  p={p}
                  index={n++}
                  current={state?.currentVersion ?? 1}
                  selected={props.selected === p.id}
                  onSelect={() => props.onSelect(p.id)}
                  onHover={props.onHover}
                  onHoverVariant={props.onHoverVariant}
                  onPreviewClick={() => props.onPreviewClick(p.id)}
                  onDecide={(a, v) => props.onDecide(p.id, a, v)}
                  onReason={(c) => props.onReason(p.id, c)}
                  onReroll={() => props.onReroll(p.id)}
                  rpc={props.rpc}
                />
              ))}
            </GroupRows>
          ) : null,
        )}
      </ul>
      <div className="pfoot">
        <h4>Versions</h4>
        <div className="versions">
          {(state?.versions ?? []).map((v) => (
            <button key={v.number} aria-pressed={v.number === active} title={v.label} onClick={() => props.onVersion(v.number)}>
              v{v.number} · {v.score}
            </button>
          ))}
        </div>
      </div>
      <div className="kbd">
        <b>↑</b>
        <b>↓</b> rows · <b>Space</b> preview · <b>A</b> approve · <b>R</b> reject · <b>1</b>
        <b>2</b>
        <b>3</b> variant · <b>D</b> re-roll · <b>C</b> commit
      </div>
    </aside>
  );
}

function GroupRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <li className="group">{title}</li>
      {children}
    </>
  );
}

const STEP_NAMES = ['Start', 'Story', 'Direction', 'Refine', 'Save', 'Saved'];

/** One decision at a time: the guide card holds the pass in focus and its actions. */
function GuidedPanel(props: Parameters<typeof Queue>[0]) {
  const { state, guide } = props;
  const all = state ? guidedPasses(state) : [];
  const focus = guide.focus;
  const upcoming = all.filter((p) => p.id !== focus?.id && (p.baseStatus === 'proposed' || p.baseStatus === 'stale'));
  const decided = all.filter((p) => p.baseStatus === 'approved' || p.baseStatus === 'rejected');
  const active = state?.viewingVersion ?? state?.currentVersion ?? 1;
  const pct = guide.progress ? Math.round((guide.progress.done / Math.max(1, guide.progress.total)) * 100) : guide.step >= 4 ? 100 : 0;
  const run = (a: GuideAction) => props.onGuideAction(a);
  return (
    <aside className="panel guided" aria-label="Guide">
      <div className="phead">
        <div className="row">
          <h2>{guide.step === 0 ? 'Start' : `Step ${Math.min(guide.step, 4)} of 4 · ${STEP_NAMES[guide.step]}`}</h2>
          <button className="linkish" onClick={() => props.onGuided(false)}>
            Show every change
          </button>
        </div>
        <div className="gbar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      {state?.brief && guide.step > 0 ? <StoryCard brief={state.brief} mood={state.mood ? describeMood(state.mood) : []} onEdit={props.onEditStory} /> : null}
      <div className="guide" aria-live="polite">
        {props.lastSkipped ? (
          <div className="askwhy">
            <span>
              Why skip <b>{props.lastSkipped.name}</b>? The next options lean the other way.
            </span>
            <div className="reasons">
              {REASON_CHIPS.map((c) => (
                <button key={c} aria-pressed={props.lastSkipped!.reason === c} onClick={() => props.onReason(props.lastSkipped!.id, c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <h3>{guide.title}</h3>
        <p className="gbody">{guide.body}</p>
        {focus ? (
          <ul className="list focus">
            <Row
              p={focus}
              index={0}
              current={state?.currentVersion ?? 1}
              selected
              guided
              onSelect={() => undefined}
              onHover={props.onHover}
              onHoverVariant={props.onHoverVariant}
              onPreviewClick={() => props.onPreviewClick(focus.id)}
              onDecide={(a, v) => props.onDecide(focus.id, a, v)}
              onReason={(c) => props.onReason(focus.id, c)}
              onReroll={() => props.onReroll(focus.id)}
              rpc={props.rpc}
            />
          </ul>
        ) : null}
        {guide.primary ? (
          <div className="gacts">
            <button className="btn primary" disabled={!!state?.busy} onClick={() => run(guide.primary!.action)}>
              {guide.primary.label}
            </button>
            {(guide.secondary ?? []).map((b) => (
              <button key={b.label} className={'btn' + (b.tone === 'tertiary' ? ' tertiary' : '')} disabled={!!state?.busy} onClick={() => run(b.action)}>
                {b.label}
              </button>
            ))}
          </div>
        ) : null}
        {focus ? (
          <div className="kbd tight">
            <b>Enter</b> keep · <b>S</b> skip · <b>D</b> other options{focus.variants.length ? ' · ' : ''}
            {focus.variants.length ? (
              <>
                <b>1</b>
                <b>2</b>
                <b>3</b> pick
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="list minis" hidden={guide.step === 0}>
        {!state?.audited && state?.brief ? <li className="mini muted">Planning…</li> : null}
        {upcoming.length ? <li className="group">Up next</li> : null}
        {upcoming.map((p) => (
          <li key={p.id} className="mini" onClick={() => props.onSelect(p.id)} title="Look at this one now">
            <span>{p.name}</span>
            <span className="fit" role="img" aria-label={`Matters ${p.impact} out of 100 for this story`} title={`How much this matters for this story: ${p.impact}/100`}>
              <i style={{ width: `${Math.max(6, p.impact)}%` }} />
            </span>
          </li>
        ))}
        {decided.length ? <li className="group">Decided</li> : null}
        {decided.map((p) => (
          <li key={p.id} className={'mini ' + p.baseStatus}>
            <span>{p.name}</span>
            <span className={'chip ' + p.baseStatus}>{p.baseStatus === 'approved' ? 'Kept' : 'Skipped'}</span>
            <button className="linkish" onClick={() => props.onDecide(p.id, p.baseStatus === 'approved' ? 'approve' : 'reject')} title="Put it back in the queue">
              undo
            </button>
          </li>
        ))}
      </ul>
      <div className="pfoot">
        <h4>Versions</h4>
        <div className="versions">
          {(state?.versions ?? []).map((v) => (
            <button key={v.number} aria-pressed={v.number === active} title={v.label} onClick={() => props.onVersion(v.number)}>
              v{v.number} · {v.score}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
