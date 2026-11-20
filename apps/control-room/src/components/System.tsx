import type { CSSProperties } from 'react';
import type { ProjectState } from '@sitemaxxing/core/protocol';

type Reading = NonNullable<ProjectState['system']>;
type Area = Reading['findings'][number]['area'];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ROLE: Record<string, string> = {
  background: 'Background',
  surface: 'Surfaces',
  ink: 'Text',
  soft: 'Quieter text',
  inverse: 'Text on fills',
  accent: 'Accent',
  other: 'Other strong colours',
  border: 'Lines',
};

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

function Colors({ r }: { r: Reading }) {
  const bg = r.colors.find((c) => c.role === 'background')?.hex ?? '#ffffff';
  const fills = r.colors.filter((c) => c.fill > 0).sort((a, b) => b.fill - a.fill);
  const roles = Object.keys(ROLE).filter((role) => r.colors.some((c) => c.role === role));
  const isText = (role: string) => role === 'ink' || role === 'soft';
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
      <div className="sys-roles">
        {roles.map((role) => (
          <div key={role} className="sys-role">
            <span>{ROLE[role]}</span>
            <div>
              {r.colors
                .filter((c) => c.role === role)
                .slice(0, 8)
                .map((c) => (
                  <figure key={c.hex} title={`${c.uses} ${c.uses === 1 ? 'element' : 'elements'}`}>
                    <i
                      style={
                        isText(role) ? { background: bg, color: c.hex } : { background: c.hex }
                      }
                    >
                      {isText(role) ? 'Aa' : null}
                    </i>
                    <figcaption>{c.hex}</figcaption>
                  </figure>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Type({ r }: { r: Reading }) {
  const t = r.type;
  const display = t.families.find((f) => f.role === 'display') ?? t.families[0];
  const top = Math.max(...t.sizes.map((s) => s.share), 0.0001);
  return (
    <>
      <div className="sys-ladder">
        {t.sizes.map((s) => (
          <figure
            key={s.px}
            className={s.px === t.base ? 'base' : ''}
            title={`${s.count} ${s.count === 1 ? 'element' : 'elements'} · ${pct(s.share)} of the text`}
          >
            <b
              style={{
                fontSize: Math.min(s.px, 72),
                fontFamily: display ? `"${display.family}", var(--ui)` : undefined,
                opacity: 0.4 + 0.6 * Math.sqrt(s.share / top),
              }}
            >
              Aa
            </b>
            <figcaption>{s.px}</figcaption>
          </figure>
        ))}
      </div>
      <p className="sys-line">
        {t.families.map((f) => `${f.family} ${pct(f.share)}`).join(' · ')}
        {t.ratio ? ` · steps of about ×${t.ratio.toFixed(2)}` : ''}
        {t.weights.length ? ` · weights ${t.weights.join(', ')}` : ''}
      </p>
    </>
  );
}

function Space({ r }: { r: Reading }) {
  const { steps, unit } = r.space;
  return (
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
  );
}

function Shape({ r }: { r: Reading }) {
  return (
    <div className="sys-steps">
      {r.shape.radii.map((x) => (
        <figure key={x.px} title={`${x.count} ${x.count === 1 ? 'element' : 'elements'}`}>
          <i className="corner" style={{ borderTopLeftRadius: Math.min(x.px, 44) }} />
          <figcaption>{x.px >= 999 ? 'full' : x.px}</figcaption>
        </figure>
      ))}
    </div>
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
export function System({ state }: { state: ProjectState | null }) {
  const r = state?.system;
  if (!r) {
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
        <div className="sys-figure">
          <b>{cov === null ? '—' : pct(cov)}</b>
          <p>
            {cov === null
              ? 'No stylesheets were found to read.'
              : 'of the colour, size and spacing values in the styles read from shared values.'}
            {cov !== null ? (
              <span>
                {written} written in place · {r.source.tokens} shared values declared
              </span>
            ) : null}
          </p>
        </div>
        {cov !== null ? <Coverage r={r} /> : null}
      </header>
      <div className="sys-grid">
        <Block title="Colour" count={`${r.colors.length} colours`} r={r} area="color">
          <Colors r={r} />
        </Block>
        <Block title="Type" count={`${r.type.sizes.length} sizes`} r={r} area="type">
          <Type r={r} />
        </Block>
        <Block
          title="Spacing"
          count={`${r.space.steps.length} values · ${pct(r.space.onGrid)} on a ${r.space.unit}px grid`}
          r={r}
          area="space"
        >
          <Space r={r} />
        </Block>
        <Block
          title="Corners and shadows"
          count={`${r.shape.radii.length} radii · ${r.shape.shadows.length} shadows`}
          r={r}
          area="shape"
        >
          <Shape r={r} />
        </Block>
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
              {r.motion.durations.map((d) => `${d.ms} ms ×${d.count}`).join(' · ')}
              {r.motion.animations.length
                ? `${r.motion.durations.length ? ' · ' : ''}${r.motion.animations.slice(0, 8).join(', ')}`
                : ''}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
