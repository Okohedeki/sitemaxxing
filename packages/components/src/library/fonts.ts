/* Curated type pairings, all open-licensed and self-hosted through Fontsource. Each sits on the
   mood axes; the Font pass picks fit, stretch and wildcard pairings for the brief. */

import type { Goal, Mood, Rng } from '@sitemaxxing/core';
import { selectReferences, SLOT_LABEL, type Reference, type Slot } from './select';

export interface FontPairing extends Reference {
  display: string;
  body: string;
  label_: string;
  /** Fontsource imports to add to the fonts file. */
  imports: string[];
  /** Display weight that suits the face. */
  displayWeight: number;
  /** Letter spacing for the headline at display size. */
  tracking: string;
  serif: boolean;
}

const sans = (f: string) => `"${f}", system-ui, sans-serif`;
const serif = (f: string) => `"${f}", Georgia, serif`;
const mono = (f: string) => `"${f}", ui-monospace, monospace`;

export const FONT_PAIRINGS: FontPairing[] = [
  { id: 'grotesk-mono', label: 'Grotesk + mono', mood: { classic: -0.4, formality: 0.3, warmth: -0.2 }, goals: ['signups', 'leads'], display: sans('Instrument Sans Variable'), body: sans('Instrument Sans Variable'), label_: mono('JetBrains Mono'), imports: ['@fontsource-variable/instrument-sans', '@fontsource/jetbrains-mono/400.css', '@fontsource/jetbrains-mono/500.css'], displayWeight: 500, tracking: '-0.035em', serif: false },
  { id: 'serif-grotesk', label: 'Serif display + grotesk', mood: { classic: 0.6, warmth: 0.3, energy: -0.2 }, goals: ['credibility', 'awareness'], display: serif('Newsreader Variable'), body: sans('Instrument Sans Variable'), label_: sans('Instrument Sans Variable'), imports: ['@fontsource-variable/newsreader', '@fontsource-variable/instrument-sans'], displayWeight: 400, tracking: '-0.02em', serif: true },
  { id: 'wide-grotesk', label: 'Wide display + grotesk', mood: { energy: 0.6, classic: -0.6 }, goals: ['awareness', 'signups'], display: sans('Unbounded'), body: sans('Instrument Sans Variable'), label_: mono('JetBrains Mono'), imports: ['@fontsource/unbounded/400.css', '@fontsource/unbounded/500.css', '@fontsource-variable/instrument-sans', '@fontsource/jetbrains-mono/400.css'], displayWeight: 400, tracking: '-0.03em', serif: false },
  { id: 'soft-serif', label: 'Soft serif + grotesk', mood: { warmth: 0.6, formality: -0.3, classic: 0.3 }, goals: ['bookings', 'sales'], display: serif('Fraunces Variable'), body: sans('Instrument Sans Variable'), label_: sans('Instrument Sans Variable'), imports: ['@fontsource-variable/fraunces', '@fontsource-variable/instrument-sans'], displayWeight: 400, tracking: '-0.025em', serif: true },
  { id: 'space', label: 'Space grotesk + mono', mood: { classic: -0.5, formality: -0.1, energy: 0.3, warmth: -0.3 }, goals: ['signups', 'awareness'], display: sans('Space Grotesk Variable'), body: sans('IBM Plex Sans'), label_: mono('Space Mono'), imports: ['@fontsource-variable/space-grotesk', '@fontsource/ibm-plex-sans/400.css', '@fontsource/ibm-plex-sans/500.css', '@fontsource/space-mono/400.css'], displayWeight: 500, tracking: '-0.035em', serif: false },
  { id: 'plex', label: 'Plex family', mood: { formality: 0.7, classic: 0.2, energy: -0.3 }, goals: ['leads', 'credibility'], display: serif('IBM Plex Serif'), body: sans('IBM Plex Sans'), label_: mono('IBM Plex Mono'), imports: ['@fontsource/ibm-plex-serif/400.css', '@fontsource/ibm-plex-serif/500.css', '@fontsource/ibm-plex-sans/400.css', '@fontsource/ibm-plex-sans/500.css', '@fontsource/ibm-plex-mono/400.css'], displayWeight: 400, tracking: '-0.02em', serif: true },
  { id: 'display-serif', label: 'High-contrast serif', mood: { classic: 0.7, formality: 0.4, energy: 0.3 }, goals: ['sales', 'awareness'], display: serif('DM Serif Display'), body: sans('Instrument Sans Variable'), label_: sans('Instrument Sans Variable'), imports: ['@fontsource/dm-serif-display/400.css', '@fontsource-variable/instrument-sans'], displayWeight: 400, tracking: '-0.015em', serif: true },
  { id: 'bricolage', label: 'Bricolage', mood: { formality: -0.5, warmth: 0.4, energy: 0.4 }, goals: ['signups', 'bookings'], display: sans('Bricolage Grotesque Variable'), body: sans('Bricolage Grotesque Variable'), label_: sans('Bricolage Grotesque Variable'), imports: ['@fontsource-variable/bricolage-grotesque'], displayWeight: 600, tracking: '-0.04em', serif: false },
  { id: 'syne', label: 'Syne + grotesk', mood: { energy: 0.7, formality: -0.3, classic: -0.5, dark: 0.3 }, goals: ['awareness'], display: sans('Syne Variable'), body: sans('Instrument Sans Variable'), label_: mono('JetBrains Mono'), imports: ['@fontsource-variable/syne', '@fontsource-variable/instrument-sans', '@fontsource/jetbrains-mono/400.css'], displayWeight: 600, tracking: '-0.03em', serif: false },
  { id: 'instrument-serif', label: 'Light serif + grotesk', mood: { classic: 0.5, density: -0.5, energy: -0.4, formality: 0.3 }, goals: ['credibility', 'bookings'], display: serif('Instrument Serif'), body: sans('Instrument Sans Variable'), label_: sans('Instrument Sans Variable'), imports: ['@fontsource/instrument-serif/400.css', '@fontsource-variable/instrument-sans'], displayWeight: 400, tracking: '-0.02em', serif: true },
  { id: 'literata', label: 'Book serif', mood: { classic: 0.6, density: 0.4, formality: 0.5 }, goals: ['credibility'], display: serif('Literata Variable'), body: serif('Literata Variable'), label_: sans('Instrument Sans Variable'), imports: ['@fontsource-variable/literata', '@fontsource-variable/instrument-sans'], displayWeight: 500, tracking: '-0.02em', serif: true },
  { id: 'archivo', label: 'Archivo', mood: { energy: 0.5, formality: 0.2, density: 0.4, warmth: -0.1 }, goals: ['sales', 'leads'], display: sans('Archivo Variable'), body: sans('Archivo Variable'), label_: mono('JetBrains Mono'), imports: ['@fontsource-variable/archivo', '@fontsource/jetbrains-mono/400.css'], displayWeight: 700, tracking: '-0.03em', serif: false },
];

export interface SelectedPairing {
  id: string;
  label: string;
  slot: Slot;
  pairing: FontPairing;
  thumbnail: string;
  attributes: Record<string, string | number>;
}

export function pkgOf(imp: string): string {
  return imp.split('/').slice(0, 2).join('/');
}

export function selectFonts(opts: { mood: Mood; goal: Goal; noise: number; rng: Rng; installed?: (pkg: string) => boolean; avoidSerif?: boolean }): SelectedPairing[] {
  let pool = FONT_PAIRINGS.filter((p) => !(opts.avoidSerif && p.serif));
  // Prefer pairings that are installed so the preview is real; fall back to all with an install note.
  if (opts.installed) {
    const ready = pool.filter((p) => p.imports.every((i) => opts.installed!(pkgOf(i))));
    if (ready.length >= 3) pool = ready;
  }
  return selectReferences(pool, opts).map((p) => ({
    id: `${p.slot}-${p.item.id}`,
    label: `${SLOT_LABEL[p.slot]} · ${p.item.label}`,
    slot: p.slot,
    pairing: p.item,
    thumbnail: fontThumb(p.item),
    attributes: { slot: p.slot, reference: p.item.id, display: p.item.display.split(',')[0].replace(/"/g, ''), body: p.item.body.split(',')[0].replace(/"/g, ''), serif: p.item.serif ? 1 : 0, displayWeight: p.item.displayWeight },
  }));
}

function fontThumb(p: FontPairing): string {
  const disp = p.display.replace(/"/g, "'");
  const body = p.body.replace(/"/g, "'");
  return `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f3f2ee"/><text x="4" y="18" font-family="${disp}" font-weight="${p.displayWeight}" font-size="13" fill="#141414">Aa</text><text x="24" y="14" font-family="${body}" font-size="5.5" fill="#141414">Body</text><text x="24" y="21" font-family="${p.label_.replace(/"/g, "'")}" font-size="4.5" fill="#6b6b6b">LABEL</text></svg>`;
}
