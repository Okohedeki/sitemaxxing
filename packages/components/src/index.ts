export * from './preloader';
export * from './navigation';
export * from './reveal';

/** Where component passes write files inside the target repo. */
export const COMPONENT_DIR = 'src/sitemaxxing';

export interface ComponentFile {
  path: string;
  content: string;
}

export * from './library/select';
export * from './library/directions';
export * from './library/fonts';
export * from './library/hero-field';
export * from './library/sections';
export * from './library/registry';
