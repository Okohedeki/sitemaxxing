import { describe, expect, it } from 'vitest';
import { setJsonValues, findKeyByValue } from './edit/json';

const doc = `{
  "brand": "Acme",
  "nav": [
    { "label": "One", "href": "#1" },
    { "label": "Two", "href": "#2" },
    { "label": "Three", "href": "#3" }
  ],
  "headline": "Old \\"quoted\\" headline",
  "nested": { "a": 1, "b": "x" }
}
`;

describe('format-preserving json edits', () => {
  it('replaces only the changed value', () => {
    const out = setJsonValues(doc, { headline: 'New headline' });
    expect(out).toContain('"headline": "New headline"');
    expect(out.split('\n').length).toBe(doc.split('\n').length);
    expect(out).toContain('{ "label": "One", "href": "#1" },');
    expect(JSON.parse(out).headline).toBe('New headline');
  });
  it('replaces arrays and nested keys without touching other lines', () => {
    const out = setJsonValues(doc, { nav: [{ label: 'One', href: '#1' }], 'nested.b': 'y' });
    const data = JSON.parse(out);
    expect(data.nav).toHaveLength(1);
    expect(data.nested.b).toBe('y');
    expect(out).toContain('"headline": "Old \\"quoted\\" headline"');
  });
  it('appends a missing key', () => {
    const out = setJsonValues(doc, { extra: 'z' });
    expect(JSON.parse(out).extra).toBe('z');
  });
  it('finds keys by value', () => {
    expect(findKeyByValue(JSON.parse(doc), 'Two')).toBe('nav.1.label');
  });
});
