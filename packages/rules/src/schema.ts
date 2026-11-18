export interface RuleCard {
  id: string;
  passes: string[];
  principle: string;
  detect: string;
  fix: string;
  source: { title: string; author: string; url: string };
  kind: 'blog' | 'book' | 'paper';
}

export function isRuleCard(x: unknown): x is RuleCard {
  const c = x as RuleCard;
  return (
    !!c &&
    typeof c.id === 'string' &&
    Array.isArray(c.passes) &&
    typeof c.principle === 'string' &&
    typeof c.detect === 'string' &&
    typeof c.fix === 'string' &&
    !!c.source &&
    typeof c.source.title === 'string' &&
    typeof c.source.url === 'string' &&
    ['blog', 'book', 'paper'].includes(c.kind)
  );
}
