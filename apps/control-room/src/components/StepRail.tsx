/** Where the guide is: Paste a page (Any URL only) → Story → Direction → Refine → Save. */
export function StepRail({ step, mode }: { step: number; mode: 'url' | 'repo' }) {
  const labels =
    mode === 'url'
      ? ['Paste a page', 'Story', 'Pick a direction', 'Refine', 'Save']
      : ['Story', 'Pick a direction', 'Refine', 'Save'];
  const at = mode === 'url' ? step : step - 1;
  return (
    <div className="rail" aria-label="Steps">
      {labels.map((l, i) => (
        <div
          key={l}
          className={i < at ? 'done' : i === at ? 'on' : ''}
          aria-current={i === at ? 'step' : undefined}
        >
          <i>{i + 1}</i>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}
