import { useEffect, useRef, useState } from 'react';
import type { Project } from '../App';

const SAMPLES: Record<string, string> = { fieldnote: 'Fieldnote', isvik: 'Isvik Expeditions' };

/** What the person typed, read the way the hub will read it (bare hosts get https). */
export function readUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|[^/:]+\.localhost)(:|\/|$)/i.test(raw);
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `${local ? 'http' : 'https'}://${raw}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && !local) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * A real before and after, set as two proof sheets: the Isvik sample at v1 underneath and v2 on
 * top. Pressing the plate (or the link under it) brings the other sheet to the front.
 */
function Compare() {
  const [before, setBefore] = useState(false);
  return (
    <figure className={'compare' + (before ? ' show-before' : '')}>
      <button
        type="button"
        className="plate"
        onClick={() => setBefore((b) => !b)}
        aria-pressed={before}
        aria-label={before ? 'Show the sample after one session' : 'Show the sample as it started'}
      >
        <span className="sheet before">
          <img src="/welcome/before.jpg" width={1136} height={720} alt="The Isvik sample as it started: a centred headline, a pill badge, two buttons and a boxed picture" />
        </span>
        <span className="sheet after">
          <img src="/welcome/after.jpg" width={1136} height={720} alt="The Isvik sample after one session: a large serif headline, one booking button and a wide picture" />
          <i className="ring" aria-hidden="true" />
        </span>
        <span className="ann" aria-hidden="true">
          {before ? 'the first proof, as pasted' : 'one headline, set large'}
        </span>
      </button>
      <figcaption>
        <b>Isvik Expeditions</b>, a sample. {before ? 'The page as it was pasted, before any change.' : 'v2 on top, after one session of 15 kept changes.'}{' '}
        <button type="button" className="linkish" onClick={() => setBefore((b) => !b)}>
          {before ? 'Show v2' : 'See where it started'}
        </button>
      </figcaption>
    </figure>
  );
}

const ROMAN = ['i', 'ii', 'iii', 'iv'];
const STEPS: Array<[string, string]> = [
  ['Paste a page', 'a minute'],
  ['Say what it is for', 'three questions'],
  ['Pick a direction', 'three takes'],
  ['Review each change, live', 'keep or skip'],
];

export function Welcome(props: {
  projects: Project[];
  connected: boolean;
  onStartUrl: (url: string) => void;
  onOpenFolder: (path: string) => void;
  onOpen: (id: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const samples = props.projects.filter((p) => SAMPLES[p.name] && !p.source);
  const recent = props.projects.filter((p) => !samples.includes(p)).slice(0, 4);
  const understood = readUrl(url);
  const host = (p: Project) => {
    try {
      return p.source ? new URL(p.source).host : p.rootPath.split(/[\\/]/).slice(-2).join('/');
    } catch {
      return p.rootPath;
    }
  };
  useEffect(() => {
    document.title = 'Sitemaxxing';
  }, []);
  return (
    <div className="home">
      <div className="light" aria-hidden="true">
        <i className="glow" />
        <i className="streak s1" />
        <i className="streak s2" />
        <i className="streak s3" />
      </div>
      <header className="home-bar">
        <span className="brand">Sitemaxxing</span>
        <span className={'conn' + (props.connected ? ' on' : '')} aria-live="polite">
          {props.connected ? 'Ready' : 'Starting…'}
        </span>
      </header>
      <main className="home-main">
        <section className="home-copy">
          <h1>
            Give your site a glow&#8209;up that is <i>yours</i>.
          </h1>
          <p className="lede">
            Paste a page. We mark it up with you, live.
            <span>One change at a time. Nothing ships until you keep it.</span>
          </p>
          <form
            className="start"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!understood) {
                setError(url.trim() ? 'That does not look like a web address. Try something like example.com.' : 'Paste the address of the page you want to start from.');
                input.current?.focus();
                return;
              }
              setError(null);
              props.onStartUrl(understood);
            }}
          >
            <label htmlFor="start-url" className="sr-only">
              Page URL
            </label>
            <input
              id="start-url"
              ref={input}
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="your-site.com…"
              spellCheck={false}
              autoComplete="url"
              inputMode="url"
              aria-invalid={!!error}
              aria-describedby="start-note"
            />
            <button className="btn primary" type="submit" disabled={!props.connected}>
              Start
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </button>
          </form>
          <p id="start-note" className={'note' + (error ? ' err' : '')} aria-live="polite">
            {error ?? (understood ? <>Opens {understood.replace(/\/$/, '')}</> : <>Your live site is never touched. Every version is a git commit.</>)}
          </p>

          <ol className="steps" aria-label="What happens next">
            {STEPS.map(([what, how], i) => (
              <li key={what}>
                <b aria-hidden="true">{ROMAN[i]}</b>
                <span>{what}</span>
                <small>{how}</small>
              </li>
            ))}
          </ol>

          <div className="alt">
            {samples.length ? (
              <>
                <span>No page handy? Try</span>
                {samples.map((p, i) => (
                  <span key={p.id}>
                    <button className="linkish strong" onClick={() => props.onOpen(p.id)}>
                      {SAMPLES[p.name]}
                    </button>
                    {i < samples.length - 1 ? <span className="or"> or</span> : null}
                  </span>
                ))}
                <span className="dot-sep" aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            {folder === null ? (
              <button className="linkish" onClick={() => setFolder('')}>
                Open a project folder instead
              </button>
            ) : null}
          </div>
          {folder !== null ? (
            <form
              className="start folder"
              onSubmit={(e) => {
                e.preventDefault();
                if (folder.trim()) props.onOpenFolder(folder.trim());
              }}
            >
              <label htmlFor="start-folder" className="sr-only">
                Project folder
              </label>
              <input id="start-folder" autoFocus value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Path to a Vite + React project…" spellCheck={false} />
              <button className="btn" type="submit" disabled={!props.connected}>
                Open
              </button>
            </form>
          ) : null}

          {recent.length ? (
            <nav className="recent" aria-label="Recent projects">
              <h2>Pick up where you left off</h2>
              <ul>
                {recent.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => props.onOpen(p.id)}>
                      <span className="rname">{p.source ? host(p) : p.name}</span>
                      <span className="rmeta">{p.source ? 'rebuilt from a page' : host(p)}</span>
                      <span className="rgo" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </section>
        <Compare />
      </main>
    </div>
  );
}
