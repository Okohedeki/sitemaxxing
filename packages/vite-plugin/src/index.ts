import type { Plugin } from 'vite';

export interface SitemaxxingPluginOptions {
  /** Hub origin that serves overlay.js. */
  hub?: string;
}

/**
 * Injects the Sitemaxxing overlay script into index.html while the dev server runs.
 * `apply: 'serve'` means the plugin is not even loaded for `vite build`, so production output
 * never references the overlay.
 */
export function sitemaxxing(options: SitemaxxingPluginOptions = {}): Plugin {
  const hub = (options.hub ?? 'http://localhost:3333').replace(/\/$/, '');
  return {
    name: 'sitemaxxing',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { src: `${hub}/overlay.js`, defer: true, 'data-sitemaxxing': '' },
          injectTo: 'body',
        },
      ];
    },
  };
}

export default sitemaxxing;
