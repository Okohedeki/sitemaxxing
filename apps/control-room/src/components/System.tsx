import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { ProjectState } from '@sitemaxxing/core/protocol';

type Reading = NonNullable<ProjectState['system']>;
type Doc = NonNullable<ProjectState['systemDoc']>;
type Area = Reading['findings'][number]['area'];
type Rpc = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Notes({ r, area }: { r: Reading; area: Area }) {
  const list = r.findings.filter((f) => f.area === area);
  if (!list.length) return null;
  return (
    <ul className="sys-notes">
      {list.map((f) => (
        <li key={f.message}>{f.message}</li>
      ))}
    </ul>
  );
}

function Block({
  title,
  count,
  r,
  area,
  children,
}: {
  title: string;
  count?: string;
  r: Reading;
  area: Area;
  children: React.ReactNode;
}) {
  return (
    <section className="sys-block">
      <header>
        <h3>{title}</h3>
        {count ? <span>{count}</span> : null}
      </header>
      {children}
      <Notes r={r} area={area} />
    </section>
  );
}

/** The stylesheets, as one bar per kind: the lit part reads from shared values. */
function Coverage({ r }: { r: Reading }) {
  const s = r.source;
  const rows = (['color', 'size', 'space'] as const).map((k) => ({
    k,
    label: { color: 'Colours', size: 'Text sizes', space: 'Spacing' }[k],
    tok: s.tokenised[k],
    lit: s.literal[k],
  }));
  return (
    <div className="sys-cover">
      {rows.map((x) => {
        const total = x.tok + x.lit;
        return (
          <div key={x.k} className="sys-cover-row">
            <span>{x.label}</span>
            <i>
              <b style={{ width: total ? pct(x.tok / total) : 0 }} />
            </i>
            <em>
              {x.tok} of {total}
            </em>
          </div>
        );
      })}
    </div>
  );
}

const GROUP = { main: 'Main', neutral: 'Neutrals', other: 'Other colours' } as const;

function copy(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined);
}

function Colors({ r, d }: { r: Reading; d: Doc }) {
  const bg = r.colors.find((c) => c.role === 'background')?.hex ?? '#ffffff';
  const fills = r.colors.filter((c) => c.fill > 0).sort((a, b) => b.fill - a.fill);
  const isText = (role: string) => role === 'ink' || role === 'soft';
  const [copied, setCopied] = useState('');
  return (
    <>
      <div
        className="sys-strip"
        role="img"
        aria-label="How much of the page each fill colour covers"
      >
        {fills.map((c) => (
          <i
            key={c.hex}
            style={{ background: c.hex, flexGrow: Math.max(c.fill, 0.012) }}
            title={`${c.hex} · ${pct(c.fill)} of the page`}
          />
        ))}
      </div>
      {(['main', 'neutral', 'other'] as const).map((g) => {
        const list = d.colors.filter((c) => c.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="sys-group">
            <span>{GROUP[g]}</span>
            <ul className="sys-colors">
              {list.map((c) => (
                <li key={c.hex}>
                  <i
                    style={isText(c.role) ? { background: bg, color: c.hex } : { background: c.hex }}
                  >
                    {isText(c.role) ? 'Aa' : null}
                  </i>
                  <div>
                    <b>{c.name}</b>
                    <button
                      type="button"
                      title="Copy the value"
                      onClick={() => {
                        void copy(c.hex);
                        setCopied(c.hex);
                        window.setTimeout(() => setCopied(''), 1200);
                      }}
                    >
                      {copied === c.hex ? 'copied' : c.hex}
                    </button>
                    <code>--color-{c.token}</code>
                    <p>{c.purpose}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {r.colors.length > d.colors.length ? (
        <p className="sys-line">
          {r.colors.length - d.colors.length} more in use, too rare to name.
        </p>
      ) : null}
    </>
  );
}

function Type({ r, d }: { r: Reading; d: Doc }) {
  const t = r.type;
  const inScale = new Set(d.type.steps.map((x) => x.px));
  return (
    <>
      <p className="sys-scale">{d.type.scale}</p>
      <ol className="sys-specimen">
        {d.type.steps.map((x) => (
          <li key={x.px}>
            <span>
              <b>{x.token}</b>
              {[`${x.px}px`, x.weight, x.lineHeight].filter(Boolean).join(' · ')}
            </span>
            <em
              style={{
                fontSize: Math.min(x.px, 52),
                fontWeight: x.weight,
                lineHeight: x.lineHeight ?? 1.2,
                fontFamily: x.family ? `"${x.family}", var(--ui)` : undefined,
              }}
            >
              Sphinx of black quartz
            </em>
          </li>
        ))}
      </ol>
      {d.type.left ? (
        <div className="sys-chips" aria-label="Every size in use">
          {t.sizes.map((x) => (
            <i
              key={x.px}
              className={inScale.has(x.px) ? '' : 'off'}
              title={`${x.count} ${x.count === 1 ? 'element' : 'elements'}`}
            >
              {x.px}
            </i>
          ))}
        </div>
      ) : null}
      <ul className="sys-faces">
        {d.type.families.map((f) => (
          <li key={f.family}>
            <b style={{ fontFamily: `"${f.family}", var(--ui)` }}>{f.family}</b>
            <span>{f.use}</span>
          </li>
        ))}
      </ul>
      <p className="sys-line">
        {t.weights.length ? `weights ${t.weights.join(', ')}` : ''}
        {d.type.left ? `${t.weights.length ? ' · ' : ''}${d.type.left} ${d.type.left === 1 ? 'size' : 'sizes'} outside the scale` : ''}
      </p>
    </>
  );
}

function Space({ r, d }: { r: Reading; d: Doc }) {
  const { steps, unit } = r.space;
  const span = (x: [number, number] | null) =>
    !x ? null : x[0] === x[1] ? `${x[0]}px` : `${x[0]}–${x[1]}px`;
  const rows = [
    { label: 'Grid', value: `${unit}px`, px: unit },
    { label: 'Between items', value: span(d.space.elementGap), px: d.space.elementGap?.[1] },
    { label: 'Inside cards', value: span(d.space.cardPadding), px: d.space.cardPadding?.[1] },
    { label: 'Between sections', value: span(d.space.sectionGap), px: d.space.sectionGap?.[1] },
  ].filter((x) => x.value);
  return (
    <>
      <dl className="sys-table">
        {rows.map((x) => (
          <div key={x.label}>
            <dt>{x.label}</dt>
            <dd>{x.value}</dd>
            <i style={{ width: Math.min(x.px ?? 0, 160) }} />
          </div>
        ))}
      </dl>
      <div className="sys-steps">
        {steps.map((s) => {
          const side = Math.max(3, Math.min(s.px, 56));
          return (
            <figure
              key={s.px}
              className={s.px % unit ? 'off' : ''}
              title={`${s.count} ${s.count === 1 ? 'use' : 'uses'}`}
            >
              <i style={{ width: side, height: side }} />
              <figcaption>{s.px}</figcaption>
            </figure>
          );
        })}
      </div>
    </>
  );
}

function Shape({ r, d }: { r: Reading; d: Doc }) {
  return (
    <>
      {d.shape.radii.length ? (
        <dl className="sys-table corners">
          {d.shape.radii.map((x) => (
            <div key={x.token}>
              <dt>{x.label}</dt>
              <dd>{x.px >= 999 ? 'full' : `${x.px}px`}</dd>
              <i style={{ borderRadius: Math.min(x.px, 14) }} />
            </div>
          ))}
        </dl>
      ) : null}
      <div className="sys-steps">
        {r.shape.radii.map((x) => (
          <figure key={x.px} title={`${x.count} ${x.count === 1 ? 'element' : 'elements'}`}>
            <i className="corner" style={{ borderTopLeftRadius: Math.min(x.px, 44) }} />
            <figcaption>{x.px >= 999 ? 'full' : x.px}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

const FORMATS = [
  { id: 'designMd', label: 'DESIGN.md', file: 'DESIGN.md' },
  { id: 'css', label: 'CSS variables', file: 'design-system.css' },
  { id: 'tailwind', label: 'Tailwind v4', file: 'design-system.tailwind.css' },
  { id: 'tokens', label: 'Design tokens', file: 'design.tokens.json' },
] as const;
type Format = (typeof FORMATS)[number]['id'];

/** The same system written out for other tools, to copy or to save into the project. */
function Export({ sig, projectId, rpc }: { sig: string; projectId: string; rpc: Rpc }) {
  const [format, setFormat] = useState<Format>('designMd');
  const [out, setOut] = useState<Record<Format, string> | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    let live = true;
    rpc('export_design_system', { project_id: projectId })
      .then((x) => live && setOut(x as Record<Format, string> | null))
      .catch(() => live && setOut(null));
    return () => {
      live = false;
    };
  }, [sig, projectId]);
  const current = FORMATS.find((f) => f.id === format)!;
  const say = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote(''), 2400);
  };
  const text = out?.[format] ?? '';
  return (
    <section className="sys-block sys-export">
      <header>
        <h3>Take it with you</h3>
        <span>{note || `${text.split('\n').length} lines`}</span>
      </header>
      <div className="sys-export-bar">
        <div className="seg" role="group" aria-label="Format">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === format}
              className={f.id === format ? 'on' : ''}
              onClick={() => setFormat(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="sys-export-acts">
          <button
            type="button"
            className="btn small"
            disabled={!text}
            onClick={() => {
              void copy(text);
              say('Copied');
            }}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn small primary"
            disabled={!text}
            onClick={() =>
              rpc('save_design_system', { project_id: projectId, format })
                .then((x) => say(`Saved to ${(x as { path: string }).path}`))
                .catch((e) => say(String(e?.message ?? e)))
            }
          >
            Save as {current.file}
          </button>
        </div>
      </div>
      <pre tabIndex={0}>{text || 'Reading…'}</pre>
    </section>
  );
}

function Rules({ d }: { d: Doc }) {
  return (
    <section className="sys-block sys-rules">
      <header>
        <h3>Rules the page already follows</h3>
        <span>written from the measurements</span>
      </header>
      <div>
        <ul className="do">
          {d.rules.do.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <ul className="dont">
          {d.rules.dont.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function sample(kind: string, look: Record<string, string>, bg: string): CSSProperties {
  const [, w, c] = look.border?.match(/^([\d.]+px)\s*(#\w+)?/) ?? [];
  const pad = (look.padding ?? '').split(' ').map((p) => Math.min(parseFloat(p) || 0, 18));
  return {
    background: look.fill && look.fill !== 'none' ? look.fill : 'transparent',
    color: look.text ?? (look.fill && look.fill !== 'none' ? undefined : bg),
    border: w ? `${w} solid ${c ?? 'currentColor'}` : undefined,
    borderRadius: Math.min(parseFloat(look.radius) || 0, kind === 'card' ? 18 : 999),
    fontSize: Math.min(parseFloat(look.size) || 14, 16),
    padding: kind === 'card' ? undefined : `${pad[0] ?? 8}px ${pad[1] ?? 14}px`,
    boxShadow: look.shadow === 'yes' ? '0 6px 16px -6px rgb(0 0 0 / 0.35)' : undefined,
  };
}

function Components({ r }: { r: Reading }) {
  const bg = r.colors.find((c) => c.role === 'background')?.hex ?? '#ffffff';
  const ink = r.colors.find((c) => c.role === 'ink')?.hex ?? '#111111';
  const name = { button: 'Buttons', field: 'Fields', card: 'Cards' };
  return (
    <div className="sys-comps">
      {r.components.map((g) => (
        <div key={g.kind} className="sys-comp">
          <span>
            {name[g.kind]} <em>{g.count}</em>
          </span>
          {/* Drawn on the project's own background, since that is where they live. */}
          <div className="sys-bench" style={{ background: bg, color: ink }}>
            {g.variants.slice(0, 10).map((v, i) => (
              <figure key={i} title={v.selector}>
                <i className={`sys-${g.kind}`} style={sample(g.kind, v.look, ink)}>
                  {g.kind === 'button' ? 'Label' : g.kind === 'field' ? 'Text' : null}
                </i>
                <figcaption>×{v.count}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** What the project has now, laid out as a specimen sheet. */
export function System({ state, rpc }: { state: ProjectState | null; rpc: Rpc }) {
  const r = state?.system;
  const d = state?.systemDoc;
  const sig = useMemo(() => JSON.stringify(d ?? null), [d]);
  if (!r || !d || !state) {
    return (
      <div className="system sheet">
        <div className="sys-empty">
          <b>Nothing read yet.</b>
          <span>The page has to load once before its colours, type and spacing can be read.</span>
        </div>
      </div>
    );
  }
  const cov = r.source.coverage;
  const written = r.source.literal.color + r.source.literal.size + r.source.literal.space;
  return (
    <div className="system sheet">
      <header className="sys-head">
        <div className="sys-say">
          <h2>{d.character}</h2>
          <p>{d.summary}</p>
        </div>
        <div className="sys-source">
          <div className="sys-figure">
            <b>{cov === null ? '—' : pct(cov)}</b>
            <p>
              {cov === null
                ? 'No stylesheets were found to read.'
                : 'of the colour, size and spacing values read from shared values.'}
              {cov !== null ? (
                <span>
                  {written} written in place · {r.source.tokens} declared
                </span>
              ) : null}
            </p>
          </div>
          {cov !== null ? <Coverage r={r} /> : null}
        </div>
      </header>
      <div className="sys-grid">
        <Block title="Colour" count={`${r.colors.length} colours`} r={r} area="color">
          <Colors r={r} d={d} />
        </Block>
        <Block title="Type" count={`${r.type.sizes.length} sizes`} r={r} area="type">
          <Type r={r} d={d} />
        </Block>
        <div className="sys-pair">
          <Block
            title="Spacing"
            count={`${d.space.density} · ${pct(r.space.onGrid)} on a ${r.space.unit}px grid`}
            r={r}
            area="space"
          >
            <Space r={r} d={d} />
          </Block>
          <Block
            title="Corners and shadows"
            count={`${r.shape.radii.length} radii · ${r.shape.shadows.length} shadows`}
            r={r}
            area="shape"
          >
            <Shape r={r} d={d} />
          </Block>
        </div>
        {r.components.length ? (
          <Block title="Components" count="grouped by how they look" r={r} area="components">
            <Components r={r} />
          </Block>
        ) : null}
        {r.motion.animations.length || r.motion.durations.length ? (
          <section className="sys-block">
            <header>
              <h3>Motion</h3>
              <span>
                {r.motion.animations.length} animations · {r.motion.durations.length} speeds
              </span>
            </header>
            <p className="sys-line">
              {r.motion.durations.map((x) => `${x.ms} ms ×${x.count}`).join(' · ')}
              {r.motion.animations.length
                ? `${r.motion.durations.length ? ' · ' : ''}${r.motion.animations.slice(0, 8).join(', ')}`
                : ''}
            </p>
          </section>
        ) : null}
        <Rules d={d} />
        <Export sig={sig} projectId={state.project.id} rpc={rpc} />
      </div>
    </div>
  );
}
