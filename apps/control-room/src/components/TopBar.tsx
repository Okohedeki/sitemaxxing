import type { ProjectState } from '@sitemaxxing/core/protocol';
import type { Project } from '../App';

export function TopBar(props: {
  mode: 'url' | 'repo';
  onMode: (m: 'url' | 'repo') => void;
  field: string;
  onField: (v: string) => void;
  projects: Project[];
  onSubmit: () => void;
  state: ProjectState | null;
  delta: { n: number; key: number } | null;
  approvedCount: number;
  onCommit: () => void;
  connected: boolean;
}) {
  const { state, delta } = props;
  const score = state?.score?.score ?? 0;
  const metrics = state?.score?.metrics ?? {};
  const next = (state?.currentVersion ?? 1) + 1;
  return (
    <header className="bar">
      <div className="brand">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="9" fill="none" stroke="#ff6b8b" strokeWidth="2" />
          <path d="M6 12.5 10 6l4 6.5" fill="none" stroke="#eef0f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Sitemaxxing
      </div>
      <div className="seg" role="group" aria-label="Source">
        <button aria-pressed={props.mode === 'url'} onClick={() => props.onMode('url')}>
          Any URL
        </button>
        <button aria-pressed={props.mode === 'repo'} onClick={() => props.onMode('repo')}>
          My repo
        </button>
      </div>
      <form
        className="url"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit();
        }}
      >
        <label htmlFor="url" style={{ position: 'absolute', left: -9999 }}>
          {props.mode === 'url' ? 'Site URL' : 'Repository path'}
        </label>
        <input id="url" list="projects" value={props.field} onChange={(e) => props.onField(e.target.value)} spellCheck={false} placeholder={props.mode === 'url' ? 'Paste a page URL, e.g. example.com' : '/path/to/your/repo'} />
        <datalist id="projects">
          {props.projects.map((p) => (
            <option key={p.id} value={p.rootPath}>
              {p.name} · {p.devUrl}
            </option>
          ))}
        </datalist>
        <button className="btn" type="submit" disabled={!props.connected}>
          Maxx it
        </button>
      </form>
      <div className="score" tabIndex={0} aria-label={`Mog score ${score}`}>
        <div className="ring">
          <svg viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#262a33" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#ff6b8b" strokeWidth="3" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .6s' }} />
          </svg>
          <b>{state?.score ? score : '–'}</b>
        </div>
        <div>
          <small>Mog score</small>
          <span className="v">{state?.viewingVersion ? `v${state.viewingVersion}` : state?.previewing ? 'previewing' : state?.view === 'current' ? `v${state.currentVersion} as is` : 'with changes'}</span>
        </div>
        <span className={'delta' + (delta ? ' show' : '') + (delta && delta.n < 0 ? ' neg' : '')}>{delta ? (delta.n > 0 ? '+' : '') + delta.n : '+0'}</span>
        <div className="metrics" role="tooltip">
          <h4>Mog score v1 · heuristic, not a target</h4>
          <table>
            <tbody>
              {Object.entries(metrics).map(([k, m]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="note">
                    {m.note}
                    <div className="m">
                      <i style={{ width: `${Math.round(m.sub * 100)}%` }} />
                    </div>
                  </td>
                  <td className="n">×{m.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Measured at 1440×900 on the committed version. The number shown adds the expected points of applied passes until the next commit.</p>
        </div>
      </div>
      <button className="btn primary" disabled={!props.approvedCount || !!state?.busy} onClick={props.onCommit}>
        {props.approvedCount ? `Commit ${props.approvedCount} → v${next}` : 'Commit'}
      </button>
    </header>
  );
}
