import type { ProjectState } from '@sitemaxxing/core/protocol';

export function StepRail({ state, recreating }: { state: ProjectState | null; recreating: boolean }) {
  const passes = state?.passes ?? [];
  const dirDone = passes.some((p) => p.defId === 'direction' && (p.status === 'approved' || p.status === 'committed'));
  const anyRefine = passes.some((p) => p.defId !== 'direction' && ['approved', 'rejected', 'committed'].includes(p.status));
  const anyApproved = passes.some((p) => p.status === 'approved');
  const step = recreating ? 0 : !state?.audited ? 0 : !dirDone && !anyRefine ? 1 : (state?.versions.length ?? 1) > 1 && !anyApproved ? 3 : 2;
  const labels = ['Recreate', 'Pick a direction', 'Refine', 'Commit'];
  return (
    <div className="rail" aria-label="Steps">
      {labels.map((l, i) => (
        <div key={l} className={i < step ? 'done' : i === step ? 'on' : ''}>
          <i>{i + 1}</i>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}
