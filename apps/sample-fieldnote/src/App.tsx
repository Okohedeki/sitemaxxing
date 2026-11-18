import content from './content.json';

function Headline({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  const [before, after] = text.split(highlight);
  return (
    <>
      {before}
      <span className="grad">{highlight}</span>
      {after}
    </>
  );
}

export default function App() {
  return (
    <div className="site">
      <header className="nav">
        <a className="logo" href="#top">
          <i className="logo-mark" aria-hidden="true" />
          {content.brand}
        </a>
        <ul className="links">
          {content.nav.map((item) => (
            <li key={item.label}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
        <div className="nav-actions">
          <a className="btn ghost" href="#login">
            {content.login}
          </a>
          <a className="btn" href="#start">
            {content.navCta}
          </a>
        </div>
      </header>

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
              <a className="btn" href="#start" data-copy="cta">
                <span>{content.cta}</span>
                <span className="arrow" aria-hidden="true">
                  →
                </span>
              </a>
              <a className="btn ghost" href="#demo">
                {content.secondaryCta}
              </a>
            </div>
            <p className="trust">{content.trust}</p>
          </div>
          <div className="art">
            <div className="blob" aria-hidden="true">
              🌾📊
            </div>
          </div>
        </section>

        <section className="features">
          {content.features.map((f) => (
            <div className="feature" key={f.title}>
              <span className="emoji" aria-hidden="true">
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="footer">
        <span>{content.footer}</span>
        <span className="facts">{content.facts.map((f) => `${f.value} ${f.label.toLowerCase()}`).join(' · ')}</span>
      </footer>
    </div>
  );
}
