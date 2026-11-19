import type { ProjectState } from '@sitemaxxing/core/protocol';

/** Story → Direction → Refine → Commit. In Any URL mode the first step is Recreate. */
export function StepRail({ state, recreating, mode }: { state: ProjectState | null; recreating: boolean; mode: 'url' | 'repo' }) {
  const passes = state?.passes ?? [];
  const dirDone = passes.some((p) => p.defId === 'direction' && (p.status === 'approved' || p.status === 'committed'));
  const anyRefine = passes.some((p) => p.defId !== 'direction' && ['approved', 'rejected', 'committed'].includes(p.status));
  const anyApproved = passes.some((p) => p.status === 'approved');
  const step = recreating || !state?.brief || !state?.audited ? 0 : !dirDone && !anyRefine ? 1 : (state?.versions.length ?? 1) > 1 && !anyApproved ? 3 : 2;
  const labels = [mode === 'url' ? 'Recreate' : 'Story', 'Pick a direction', 'Refine', 'Commit'];
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
