import { useEffect, useState } from 'react';
import type { ProjectState } from '@sitemaxxing/core/protocol';

const STEPS: Array<[string, string?]> = [
  ['Capturing page, styles and assets'],
  ['Rebuilding as editable components'],
  ['Comparing against the original', '93% visual match'],
  ['Scoring first impression', 'Mog score 34'],
  ['Drafting directions and changes'],
];

/** The recreate overlay from the mockup. In v1 it is UI only and shows on the Any URL path. */
function Recreate({ host, onDone }: { host: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (i > STEPS.length) return;
    const t = window.setTimeout(() => setI(i + 1), reduced ? 0 : 650);
    return () => window.clearTimeout(t);
  }, [i, reduced]);
  return (
    <div className="recreate" role="status">
      <div>
        <h3>Recreating {host}</h3>
        <ol>
          {STEPS.map((s, k) => (
            <li key={s[0]} className={k < i ? 'done' : k === i ? 'doing' : ''}>
              <i />
              <span>{s[0]}</span>
              {k < i && s[1] ? <em>{s[1]}</em> : null}
            </li>
          ))}
        </ol>
        <div className="phase">Any URL mode · coming in Phase 3</div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '10px 0 0' }}>For now, point Sitemaxxing at a repo with a dev server.</p>
        <button className="btn small" style={{ marginTop: 12 }} onClick={onDone}>
          Back to My repo
        </button>
      </div>
    </div>
  );
}

export function Stage({ state, mode, field, recreating, onRecreated }: { state: ProjectState | null; mode: 'url' | 'repo'; field: string; recreating: boolean; onRecreated: () => void }) {
  const url = state?.versionUrl ?? state?.project.devUrl ?? '';
  const host = (() => {
    try {
      return new URL(mode === 'url' ? field : url).host;
    } catch {
      return field;
    }
  })();
  return (
    <div className="browser">
      <div className="chrome">
        <span />
        <span />
        <span />
        <em>
          {host}
          {mode === 'url' ? ' · recreated copy' : state?.viewingVersion ? ` · v${state.viewingVersion} (read-only)` : ' · dev server'}
        </em>
      </div>
      <div className="frame">
        {recreating ? <Recreate host={host} onDone={onRecreated} /> : null}
        {url ? <iframe title="Live site" src={url} /> : <div className="empty">No project loaded yet. Run `sitemaxxing dev` in a repo, or type a path above and press Maxx it.</div>}
      </div>
    </div>
  );
}
