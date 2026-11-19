import type { PassDefinition } from '@sitemaxxing/core';
import { direction } from './direction';
import { declutter } from './declutter';
import { heroLayout } from './hero-layout';
import { spacing } from './spacing';
import { copy } from './copy';
import { alignment } from './alignment';
import { font } from './font';
import { fontSize } from './font-size';
import { imagery } from './imagery';
import { navDropdown } from './nav-dropdown';
import { arrowButton } from './arrow-button';
import { revealHero } from './reveal-hero';
import { heroArt } from './hero-art';
import { preloader } from './preloader';
import { proof, features, closingCta } from './sections';

/** The built-in set, coarse to fine. */
export const passes: PassDefinition[] = [direction, declutter, heroLayout, spacing, copy, alignment, font, fontSize, imagery, navDropdown, arrowButton, revealHero, heroArt, preloader, proof, features, closingCta];

export { direction, declutter, heroLayout, spacing, copy, alignment, font, fontSize, imagery, navDropdown, arrowButton, revealHero, heroArt, preloader, proof, features, closingCta };
export { sectionPass } from './sections';
export { ruleBasedRewrite } from './copy';
export * as shared from './shared';
export default { passes };
