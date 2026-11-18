import type { PassDefinition, RuleCard } from './types';

export const definePass = (p: PassDefinition): PassDefinition => p;

export const defineComponent = (p: Omit<PassDefinition, 'kind'>): PassDefinition => ({
  ...p,
  kind: 'component',
});

export const defineRuleCard = (c: RuleCard): RuleCard => c;

/** Marks a module as a Sitemaxxing pass plugin. Third-party packages export `passes`. */
export interface PassPlugin {
  passes: PassDefinition[];
}
