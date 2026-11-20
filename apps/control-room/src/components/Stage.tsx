import type { ProjectState } from '@sitemaxxing/core/protocol';

export interface RecreateState {
  url: string;
  current: string | null;
  error?: string;
}

const STEPS = [
  'Opening the page',
  'Reading the layout',
  'Writing it as code',
  'Starting its dev server',
  'Measuring v1',
];

/** Live progress while a pasted page is rebuilt as code. */
function Recreate({ r, onClose }: { r: RecreateState; onClose: () => void }) {
  const at = r.current ? STEPS.indexOf(r.current) : -1;
  const host = (() => {
    try {
      return new URL(/^[a-z]+:\/\//i.test(r.url) ? r.url : `https://${r.url}`).host;
    } catch {
      return r.url;
    }
  })();
  return (
    <div className="recreate" role="status">
      <div>
        <h3>{r.error ? `Could not rebuild ${host}` : `Rebuilding ${host} as code`}</h3>
        {r.error ? (
          <>
            <p className="err">{r.error}</p>
            <button className="btn small" style={{ marginTop: 12 }} onClick={onClose}>
              Try another page
            </button>
          </>
        ) : (
          <>
            <ol>
              {STEPS.map((s, k) => (
                <li key={s} className={k < at ? 'done' : k === at ? 'doing' : ''}>
                  <i />
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <p className="note">
              The copy, colours and fonts come from the page. This becomes v1; nothing on the live
              site changes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function Stage({
  state,
  recreate,
  onCloseRecreate,
}: {
  state: ProjectState | null;
  recreate: RecreateState | null;
  onCloseRecreate: () => void;
}) {
  const url = state?.versionUrl ?? state?.project.devUrl ?? '';
  const host = (() => {
    try {
      return new URL(state?.source ?? url).host;
    } catch {
      return '';
    }
  })();
  return (
    <div className="browser sheet">
      <div className="chrome">
        <span className="lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <em>
          {host}
          {state?.viewingVersion
            ? ` · v${state.viewingVersion} (read-only)`
            : state?.source
              ? ' · rebuilt as code'
              : url
                ? ' · dev server'
                : ''}
        </em>
        {state ? <span className="vbadge">v{state.viewingVersion ?? state.currentVersion}</span> : null}
      </div>
      <div className="frame">
        {recreate ? <Recreate r={recreate} onClose={onCloseRecreate} /> : null}
        {url ? (
          <iframe title="Live site" src={url} />
        ) : (
          <div className="empty">
            <b>Waiting for a page.</b>
            <span>Sitemaxxing rebuilds it as code, saves that as v1, and walks you through the glow-up one decision at a time.</span>
          </div>
        )}
      </div>
    </div>
  );
}
