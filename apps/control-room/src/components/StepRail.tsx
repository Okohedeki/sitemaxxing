/** Where the guide is: Paste a page (Any URL only) → Story → Direction → Refine → Save, as tabs. */
export function StepRail({ step, mode }: { step: number; mode: 'url' | 'repo' }) {
  const labels = mode === 'url' ? ['Paste', 'Story', 'Direction', 'Refine', 'Save'] : ['Story', 'Direction', 'Refine', 'Save'];
  const at = mode === 'url' ? step : step - 1;
  return (
    <ol className="rail" aria-label="Steps">
      {labels.map((l, i) => (
        <li key={l} className={i < at ? 'done' : i === at ? 'on' : ''} aria-current={i === at ? 'step' : undefined}>
          {l}
        </li>
      ))}
    </ol>
  );
}
