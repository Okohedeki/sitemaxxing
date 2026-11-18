import content from './content.json';

function Headline({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  const [before, after] = text.split(highlight);
  return (
    <>
      {before}
      <em className="accent">{highlight}</em>
      {after}
    </>
  );
}

function Iceberg() {
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fa9c8" />
          <stop offset="1" stopColor="#d9e3ee" />
        </linearGradient>
        <linearGradient id="ice" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f8fc" />
          <stop offset=".55" stopColor="#9ec3e6" />
          <stop offset="1" stopColor="#3f7cc0" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d5a8c" />
          <stop offset="1" stopColor="#0e2442" />
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky)" />
      <path d="M120 360 L210 170 L265 205 L330 90 L400 150 L455 120 L560 250 L620 230 L700 360Z" fill="url(#ice)" />
      <path d="M330 90 L360 230 L300 360 L270 360 L300 230Z" fill="#cfe2f4" opacity=".7" />
      <path d="M455 120 L470 260 L430 360 L410 360Z" fill="#5d93cc" opacity=".55" />
      <rect y="355" width="800" height="145" fill="url(#sea)" />
      <path d="M150 362 L690 362 L640 392 L200 392Z" fill="#7fb1de" opacity=".35" />
    </svg>
  );
}

export default function App() {
  return (
    <div className="site">
      <nav className="nav">
        <a className="logo" href="#top">
          <b className="logo-mark" aria-hidden="true" />
          {content.brand}
        </a>
        <ul className="links">
          {content.nav.map((item) =>
            item.label === 'Destinations' ? (
              <li className="has-dd" key={item.label}>
                {item.label} ▾
                <div className="dd">
                  {content.destinations.map((d) => (
                    <a href={d.href} key={d.label}>
                      {d.label}
                      <small>{d.blurb}</small>
                    </a>
                  ))}
                </div>
              </li>
            ) : (
              <li key={item.label}>
                <a href={item.href}>{item.label}</a>
              </li>
            ),
          )}
        </ul>
        <div className="nav-actions">
          <a className="btn ghost" href="#signin">
            {content.login}
          </a>
          <a className="btn" href="#book">
            {content.navCta}
          </a>
        </div>
      </nav>

      <main id="top">
        <section className="hero">
          <div className="copy">
            <span className="pill" data-copy="pill">
              {content.pill}
            </span>
            <h1 className="h1" data-copy="headline">
              <Headline text={content.headline} highlight={content.highlight} />
            </h1>
            <p className="sub" data-copy="subhead">
              {content.subhead}
            </p>
            <div className="ctas">
              <a className="btn" href="#plan" data-copy="cta">
                <span>{content.cta}</span>
                <span className="arrow" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="btn ghost" href="#voyages">
                {content.secondaryCta}
              </a>
            </div>
            <div className="badges">
              {content.badges.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
          </div>
          <div className="media">
            <Iceberg />
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>{content.footer}</span>
        <span className="facts">{content.facts.map((f) => `${f.value} ${f.label.toLowerCase()}`).join(' · ')}</span>
      </footer>
    </div>
  );
}
