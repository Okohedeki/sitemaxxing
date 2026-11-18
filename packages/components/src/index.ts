export * from './dot-field';
export * from './preloader';
export * from './navigation';
export * from './reveal';

/** Where component passes write files inside the target repo. */
export const COMPONENT_DIR = 'src/sitemaxxing';

export interface ComponentFile {
  path: string;
  content: string;
}

export const FONT_PAIRS: Record<string, { label: string; display: string; body: string; label_: string; imports: string[]; thumb: string }> = {
  'grotesk-mono': {
    label: 'Grotesk + mono',
    display: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    body: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    label_: '"JetBrains Mono", ui-monospace, monospace',
    imports: ['@fontsource-variable/instrument-sans', '@fontsource/jetbrains-mono/400.css', '@fontsource/jetbrains-mono/500.css'],
    thumb: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#eeede8"/><text x="5" y="17" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#121212">Aa</text><text x="24" y="17" font-family="Menlo, monospace" font-size="8" fill="#121212">01 ab</text><rect x="5" y="22" width="20" height="2" fill="#121212"/></svg>',
  },
  'serif-grotesk': {
    label: 'Serif display + grotesk',
    display: '"Newsreader Variable", "Newsreader", Georgia, serif',
    body: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    label_: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    imports: ['@fontsource-variable/newsreader', '@fontsource-variable/instrument-sans'],
    thumb: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f4efe6"/><text x="5" y="18" font-family="Georgia, serif" font-size="13" fill="#1d1a16">Aa</text><text x="25" y="17" font-family="Helvetica, Arial, sans-serif" font-size="7" fill="#1d1a16">text</text><rect x="5" y="22" width="20" height="2" fill="#2c4a2e"/></svg>',
  },
  'wide-grotesk': {
    label: 'Wide display + grotesk',
    display: '"Unbounded", "Instrument Sans Variable", system-ui, sans-serif',
    body: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
    label_: '"JetBrains Mono", ui-monospace, monospace',
    imports: ['@fontsource/unbounded/400.css', '@fontsource/unbounded/500.css', '@fontsource-variable/instrument-sans', '@fontsource/jetbrains-mono/400.css'],
    thumb: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#0b1020"/><text x="4" y="18" font-family="Impact, Helvetica, sans-serif" font-size="12" letter-spacing="1" fill="#eef1f8">AA</text><rect x="5" y="22" width="20" height="2" fill="#ffb23e"/></svg>',
  },
};

export const DIRECTIONS: Record<string, { label: string; tokens: Record<string, string>; thumb: string; attributes: Record<string, string | number> }> = {
  lab: {
    label: 'Lab',
    tokens: { '--bg': '#eeede8', '--ink': '#121212', '--soft': '#5d5d58', '--line': '#d6d4cc', '--acc': '#ff4a1c', '--dot': '#121212' },
    attributes: { tone: 'neutral', colorfulness: 'low', contrast: 'high' },
    thumb:
      '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#eeede8"/><rect x="5" y="8" width="24" height="4" fill="#121212"/><rect x="5" y="15" width="16" height="4" fill="#121212"/><circle cx="38" cy="16" r="6" fill="none" stroke="#121212" stroke-dasharray="1 1.6"/><rect x="5" y="23" width="6" height="2" fill="#ff4a1c"/></svg>',
  },
  editorial: {
    label: 'Editorial',
    tokens: { '--bg': '#f4efe6', '--ink': '#1d1a16', '--soft': '#6b6358', '--line': '#ddd3c3', '--acc': '#2c4a2e', '--dot': '#2c4a2e' },
    attributes: { tone: 'warm', colorfulness: 'low', contrast: 'medium' },
    thumb:
      '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f4efe6"/><text x="5" y="16" font-family="Georgia" font-size="9" fill="#1d1a16">Know</text><text x="5" y="25" font-family="Georgia" font-size="9" fill="#1d1a16">every</text><circle cx="38" cy="16" r="6" fill="#2c4a2e" opacity=".85"/></svg>',
  },
  signal: {
    label: 'Signal',
    tokens: { '--bg': '#0b1020', '--ink': '#eef1f8', '--soft': '#9aa3b8', '--line': '#232b44', '--acc': '#ffb23e', '--dot': '#ffb23e' },
    attributes: { tone: 'dark', colorfulness: 'medium', contrast: 'high' },
    thumb:
      '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#0b1020"/><rect x="5" y="9" width="22" height="4" fill="#eef1f8"/><rect x="5" y="16" width="14" height="4" fill="#eef1f8"/><g fill="#ffb23e"><circle cx="34" cy="12" r="1"/><circle cx="38" cy="12" r="1"/><circle cx="42" cy="12" r="1"/><circle cx="34" cy="16" r="1"/><circle cx="38" cy="16" r="1.6"/><circle cx="42" cy="16" r="1"/><circle cx="34" cy="20" r="1"/><circle cx="38" cy="20" r="1"/><circle cx="42" cy="20" r="1"/></g></svg>',
  },
};
