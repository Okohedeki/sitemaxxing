import { useEffect, useRef, useState } from 'react';
import type { Project } from '../App';

/** The bundled samples, with what each one is good for trying. */
const SAMPLES: Record<string, { name: string; what: string }> = {
  fieldnote: { name: 'Fieldnote', what: 'A SaaS landing page with stock icons and a generic hero' },
  isvik: { name: 'Isvik Expeditions', what: 'A travel site with a pill badge, two CTAs and a boxed photo' },
};

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

/** The start screen: open a page, a sample, a folder, or pick up a recent project. A tool, not a pitch. */
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
  const recent = props.projects.filter((p) => !samples.includes(p)).slice(0, 6);
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
      <header className="bar home-bar">
        <span className="brand">Sitemaxxing</span>
        <span className="bar-sp" />
        <span className={'conn' + (props.connected ? ' on' : '')} aria-live="polite">
          {props.connected ? 'Hub ready' : 'Starting the hub…'}
        </span>
      </header>
      <main className="start-main">
        <section className="start-card" aria-labelledby="start-title">
          <h1 id="start-title">Open a page</h1>
          <p className="start-sub">
            Paste any URL. It is rebuilt as code and saved as v1, then you review changes one at a time. The live site is never touched.
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
              placeholder="your-site.com"
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
            {error ?? (understood ? <>Opens {understood.replace(/\/$/, '')}</> : <>Every version is a git commit you can go back to.</>)}
          </p>

          {samples.length ? (
            <div className="start-section">
              <h2>Try a sample</h2>
              <div className="samples">
                {samples.map((p) => (
                  <button key={p.id} className="sample" aria-label={SAMPLES[p.name].name} onClick={() => props.onOpen(p.id)}>
                    <b>{SAMPLES[p.name].name}</b>
                    <span>{SAMPLES[p.name].what}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {recent.length ? (
            <nav className="start-section recent" aria-label="Recent projects">
              <h2>Recent</h2>
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

          <div className="start-section">
            {folder === null ? (
              <button className="linkish" onClick={() => setFolder('')}>
                Open a Vite + React project folder instead
              </button>
            ) : (
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
                <input id="start-folder" autoFocus value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Path to a Vite + React project" spellCheck={false} />
                <button className="btn" type="submit" disabled={!props.connected}>
                  Open
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
