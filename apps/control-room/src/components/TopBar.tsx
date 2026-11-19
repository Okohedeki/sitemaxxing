import type { ReactNode } from 'react';
import type { ProjectState } from '@sitemaxxing/core/protocol';

/** The workspace bar: where you are, which step, how it scores, and the one action that saves the work. */
export function TopBar(props: {
  state: ProjectState | null;
  delta: { n: number; key: number } | null;
  approvedCount: number;
  rail?: ReactNode;
  onCommit: () => void;
  onHome: () => void;
}) {
  const { state, delta } = props;
  const score = state?.score?.score ?? 0;
  const metrics = state?.score?.metrics ?? {};
  const next = (state?.currentVersion ?? 1) + 1;
  const where = (() => {
    if (!state) return '';
    try {
      return state.source ? new URL(state.source).host : state.project.name;
    } catch {
      return state.project.name;
    }
  })();
  return (
    <header className="bar">
      <button className="brand" onClick={props.onHome} title="Back to the start">
        Sitemaxxing
      </button>
      {state ? (
        <div className="where" title={state.source ?? state.project.rootPath}>
          <b>{where}</b>
          <span className="ver">v{state.viewingVersion ?? state.currentVersion}</span>
        </div>
      ) : null}
      {props.rail}
      <span className="bar-sp" />
      <button className="linkish" onClick={props.onHome}>
        New page
      </button>
      <div className="score" tabIndex={0} aria-label={`Mog score ${score}`}>
        <b className="n">{state?.score ? score : '–'}</b>
        <span className={'delta' + (delta ? ' show' : '') + (delta && delta.n < 0 ? ' neg' : '')}>{delta ? (delta.n > 0 ? '+' : '') + delta.n : '+0'}</span>
        <div className="sl">
          <small>Mog score</small>
          <span className="v">{state?.viewingVersion ? `v${state.viewingVersion}` : state?.previewing ? 'previewing' : state?.view === 'current' ? `v${state.currentVersion} as is` : 'with changes'}</span>
        </div>
        <div className="metrics" role="tooltip">
          <h4>A check on the first glance, not a target. It measures the first screen at 1440×900 for a typical visitor. It ignores your story and your taste, and people differ.</h4>
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
          <p>Re-measured on the real page after each change.</p>
        </div>
      </div>
      <button className="btn primary" disabled={!props.approvedCount || !!state?.busy} onClick={props.onCommit}>
        {props.approvedCount ? `Save ${props.approvedCount} as v${next}` : 'Save'}
      </button>
    </header>
  );
}
