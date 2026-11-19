import { useEffect, useRef, useState } from 'react';
import type { Project } from '../App';

const SAMPLES: Record<string, string> = { fieldnote: 'Fieldnote', isvik: 'Isvik Expeditions' };
const SWEPT = 'sm.welcome.swept';

const remember = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string) => {
    try {
      window.localStorage.setItem(k, '1');
    } catch {
      /* private mode: the sweep simply plays again */
    }
  },
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

/**
 * A real before and after: the Isvik sample at v1 and after one guided session (v2). Two stacked
 * layers with a clip-path split. It sweeps once per visitor to explain itself, and the moment it
 * is touched the person's drag takes over.
 */
function Compare() {
  const first = useRef(remember.get(SWEPT) === null);
  const [x, setX] = useState(first.current ? 10 : 56);
  const [driven, setDriven] = useState(false);
  useEffect(() => {
    if (!first.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setX(56);
      remember.set(SWEPT);
      return;
    }
    const t = window.setTimeout(() => {
      setX((v) => (v === 10 ? 56 : v));
      remember.set(SWEPT);
    }, 450);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <figure className="compare">
      <div className={'compare-frame' + (driven ? ' driven' : '')} style={{ ['--x' as string]: `${x}%` }}>
        <img src="/welcome/before.jpg" width={1136} height={720} alt="The Isvik sample as it started: a centred headline, a pill badge, two buttons and a boxed picture" />
        <img className="top" src="/welcome/after.jpg" width={1136} height={720} alt="The Isvik sample after one session: a large serif headline, one booking button and a wide picture" />
        <i className="handle" aria-hidden="true" />
        <span className="tag tag-left" aria-hidden="true">
          After
        </span>
        <span className="tag tag-right" aria-hidden="true">
          Before
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={x}
          aria-label="Compare the sample after one session with how it started"
          aria-valuetext={`${x}% after`}
          onPointerDown={() => setDriven(true)}
          onKeyDown={() => setDriven(true)}
          onChange={(e) => setX(Number(e.target.value))}
        />
      </div>
      <figcaption>
        <b>Isvik Expeditions</b>, a sample. Drag to compare where it started with v2, after one session of 15 kept changes.
      </figcaption>
    </figure>
  );
}

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
      <header className="home-bar">
        <span className="brand">
          <Mark />
          Sitemaxxing
        </span>
        <span className={'conn' + (props.connected ? ' on' : '')} aria-live="polite">
          {props.connected ? 'Ready' : 'Starting…'}
        </span>
      </header>
      <main className="home-main">
        <section className="home-copy">
          <h1>Give your site a glow&#8209;up that is yours.</h1>
          <p className="lede">Paste a page and Sitemaxxing rebuilds it as code you own. Your live site is never touched.</p>
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
            {error ?? (understood ? <>Opens {understood.replace(/\/$/, '')}</> : <>Any public page works, with or without https://</>)}
          </p>

          <ol className="steps" aria-label="What happens next">
            <li>
              <b>1</b>Paste a page
            </li>
            <li>
              <b>2</b>Say what it is for
            </li>
            <li>
              <b>3</b>Pick a direction
            </li>
            <li>
              <b>4</b>Review each change
            </li>
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

export function Mark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M6 12.5 10 6l4 6.5" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
