import content from './content.json';

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
          <a className="btn" href="#start">
            {content.navCta}
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero solo">
          <div className="copy">
            <h1 className="h1" data-copy="headline">
              {content.headline}
            </h1>
            <p className="sub" data-copy="subhead">
              {content.subhead}
            </p>
            <div className="ctas">
              <a className="btn" href="#start" data-copy="cta">
                {content.cta}
              </a>
            </div>
          </div>
        </section>

        <section className="features">
          <h2 className="features-title">{content.featuresTitle}</h2>
          {content.features.map((f) => (
            <div className="feature" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="footer">
        <span>{content.footer}</span>
      </footer>
    </div>
  );
}
