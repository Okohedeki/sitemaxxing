import { useEffect, useState } from 'react';
import type { PassView, ProjectState, ReasonChip } from '@sitemaxxing/core/protocol';
import { REASON_CHIPS } from '@sitemaxxing/core/protocol';

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
};

interface RuleCard {
  id: string;
  principle: string;
  fix: string;
  source: { title: string; author: string; url: string };
}

function chipFor(p: PassView, current: number): [string, string] {
  switch (p.status) {
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
  reason?: ReasonChip;
  onSelect: () => void;
  onHover: (id: string | null) => void;
  onHoverVariant: (passId: string, variantId: string | null) => void;
  onPreviewClick: () => void;
  onDecide: (action: 'approve' | 'reject' | 'pick' | 'regenerate', variantId?: string) => void;
  onReason: (chip: ReasonChip) => void;
  rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;
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
      className={['item', enter ? 'enter' : '', p.status === 'rejected' ? 'rejected' : '', p.status === 'previewing' ? 'previewing' : '', p.status === 'skipped' ? 'skipped' : '', props.selected ? 'selected' : ''].join(' ')}
      onMouseEnter={() => !locked && props.onHover(p.id)}
      onMouseLeave={() => !locked && props.onHover(null)}
      onClick={props.onSelect}
    >
      <span className="num">{String(props.index + 1).padStart(2, '0')}</span>
      <div>
        <h3>
          <span className="t">{p.name}</span>
          <span className={'chip ' + cls}>{label}</span>
          {p.status !== 'skipped' ? <span className="pts">+{p.points}</span> : null}
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
        <p>{p.status === 'skipped' ? `Skipped: ${p.skipReason ?? 'already fine'}` : (p.summary ?? p.description)}</p>
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
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {p.status === 'rejected' ? (
          <div className="reasons" aria-label="Why not?">
            {REASON_CHIPS.map((c) => (
              <button key={c} aria-pressed={props.reason === c} onClick={(e) => (e.stopPropagation(), props.onReason(c))}>
                {c}
              </button>
            ))}
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
      </div>
      <div className="acts">
        <button className="ib pv" title="Preview" aria-label={`Preview ${p.name}`} disabled={locked} onClick={(e) => (e.stopPropagation(), props.onPreviewClick())}>
          {icons.eye}
        </button>
        <button className="ib ok" title="Approve" aria-label={`Approve ${p.name}`} aria-pressed={p.status === 'approved' || p.status === 'committed'} disabled={locked || p.status === 'stale'} onClick={(e) => (e.stopPropagation(), props.onDecide('approve'))}>
          {icons.ok}
        </button>
        <button className="ib no" title="Reject" aria-label={`Reject ${p.name}`} aria-pressed={p.status === 'rejected'} disabled={locked} onClick={(e) => (e.stopPropagation(), props.onDecide('reject'))}>
          {icons.no}
        </button>
      </div>
    </li>
  );
}

export function Queue(props: {
  state: ProjectState | null;
  playing: boolean;
  selected: string | null;
  reasons: Record<string, ReasonChip | undefined>;
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
  rpc: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}) {
  const { state } = props;
  const passes = state?.passes ?? [];
  const groups: Array<[string, PassView[]]> = [
    ['Step 2 · Pick a direction', passes.filter((p) => p.kind === 'direction')],
    ['Step 3 · Refine', passes.filter((p) => p.kind === 'refine')],
    ['Step 3 · Components', passes.filter((p) => p.kind === 'component')],
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
          <button className="btn" onClick={props.onPlay} disabled={!state?.audited}>
            {props.playing ? 'Stop' : 'Play all live'}
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={props.onApproveAll} disabled={!state?.audited}>
              Approve all
            </button>
            <button className="btn" onClick={props.onReset} disabled={!state}>
              Reset
            </button>
          </div>
        </div>
      </div>
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
                  reason={props.reasons[p.id]}
                  onSelect={() => props.onSelect(p.id)}
                  onHover={props.onHover}
                  onHoverVariant={props.onHoverVariant}
                  onPreviewClick={() => props.onPreviewClick(p.id)}
                  onDecide={(a, v) => props.onDecide(p.id, a, v)}
                  onReason={(c) => props.onReason(p.id, c)}
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
        <b>3</b> variant · <b>C</b> commit
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
