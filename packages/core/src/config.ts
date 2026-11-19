import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import type { ResolvedConfig, SitemaxxingConfig } from './types';

export const defineConfig = (c: SitemaxxingConfig): SitemaxxingConfig => c;

export const DEFAULT_CONFIG: ResolvedConfig = {
  devUrl: 'http://localhost:5173',
  content: 'src/content.json',
  sections: 'auto',
  passes: ['default'],
  llm: {},
  viewports: [
    [1440, 900],
    [390, 844],
  ],
  sources: { app: 'src/App.tsx', styles: 'src/styles.css', tokens: 'src/tokens.css', fonts: 'src/fonts.ts' },
};

export function configPath(root: string): string | null {
  for (const name of ['sitemaxxing.config.ts', 'sitemaxxing.config.js', 'sitemaxxing.config.mjs']) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function loadConfig(root: string): Promise<ResolvedConfig> {
  const p = configPath(root);
  let user: SitemaxxingConfig = { devUrl: DEFAULT_CONFIG.devUrl };
  if (p) {
    // `sitemaxxing` resolves to this module, so a config can be read before the package is installed.
    const self = fileURLToPath(import.meta.url);
    const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { sitemaxxing: self, 'sitemaxxing/config': self } });
    const mod: any = await jiti.import(p);
    user = (mod?.default ?? mod) as SitemaxxingConfig;
  }
  return resolveConfig(user, root);
}

/** Guess sensible source paths when the user didn't configure them. */
export function resolveConfig(user: SitemaxxingConfig, root: string): ResolvedConfig {
  const sources = { ...DEFAULT_CONFIG.sources, ...(user.sources ?? {}) };
  const pick = (candidates: string[], fallback: string) =>
    candidates.find((c) => fs.existsSync(path.join(root, c))) ?? fallback;
  if (!user.sources?.app) sources.app = pick(['src/App.tsx', 'src/App.jsx', 'src/app.tsx', 'src/main.tsx'], sources.app);
  if (!user.sources?.styles) sources.styles = pick(['src/styles.css', 'src/App.css', 'src/index.css', 'src/style.css'], sources.styles);
  if (!user.sources?.tokens) sources.tokens = pick(['src/tokens.css', 'src/index.css', 'src/styles.css', 'src/App.css'], sources.tokens);
  if (!user.sources?.fonts) sources.fonts = pick(['src/fonts.ts', 'src/fonts.js', 'src/main.tsx'], sources.fonts);
  return {
    ...DEFAULT_CONFIG,
    ...user,
    llm: user.llm ?? {},
    content: user.content ?? pick(['src/content.json', 'content.json'], DEFAULT_CONFIG.content),
    sections: user.sections ?? 'auto',
    passes: user.passes ?? ['default'],
    viewports: user.viewports ?? DEFAULT_CONFIG.viewports,
    sources,
    category: user.category,
  };
}

export function writeDefaultConfig(root: string, devUrl: string): string {
  const p = path.join(root, 'sitemaxxing.config.ts');
  const text = `import { defineConfig } from 'sitemaxxing';

export default defineConfig({
  devUrl: '${devUrl}',
  content: './src/content.json',
  sections: 'auto',
  passes: ['default'],
  llm: { provider: 'anthropic' },
  viewports: [[1440, 900], [390, 844]],
  // Optional: the story can also be told in the control room's first step.
  // brief: { story: 'What this is and why it exists.', audience: 'who it is for', goal: 'signups', feeling: ['calm', 'precise'], noise: 0.35 },
});
`;
  fs.writeFileSync(p, text);
  return p;
}
