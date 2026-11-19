/* The guided path: one decision at a time, always with an obvious next action. */

import type { PassView, ProjectState } from '@sitemaxxing/core/protocol';

export type GuideAction =
  | 'keep'
  | 'skip'
  | 'reroll'
  | 'regenerate'
  | 'commit'
  | 'randomize'
  | 'story';

export interface Guide {
  /** 0 start, 1 story, 2 direction, 3 refine, 4 commit, 5 saved. */
  step: number;
  title: string;
  body: string;
  /** The pass this step is about, if any. */
  focus: PassView | null;
  /** Progress through the refine step. */
  progress?: { done: number; total: number };
  primary?: { label: string; action: GuideAction };
  /** Secondary actions; a tertiary one is styled as a link (one primary per view). */
  secondary?: Array<{ label: string; action: GuideAction; tone?: 'secondary' | 'tertiary' }>;
}

const undecided = (p: PassView) => p.baseStatus === 'proposed' || p.baseStatus === 'stale';

/** The passes the guide walks through, in order: direction first, then everything else proposed. */
export function guidedPasses(state: ProjectState): PassView[] {
  return state.passes.filter((p) => p.status !== 'skipped' && p.baseStatus !== 'committed');
}

export function guideOf(
  state: ProjectState | null,
  selected: string | null,
  recreating: boolean,
): Guide {
  if (recreating)
    return {
      step: 0,
      title: 'Rebuilding the page as code',
      body: 'Reading the page and writing it as an editable project. This becomes v1.',
      focus: null,
    };
  if (!state) {
    return {
      step: 0,
      title: 'Paste a page to start',
      body: 'Paste any public URL above and press Maxx it. Sitemaxxing rebuilds it as code and saves that as v1. Working on your own code? Switch to My repo.',
      focus: null,
    };
  }
  if (!state.brief)
    return {
      step: 1,
      title: 'Tell the story',
      body: 'Everything is planned from this.',
      focus: null,
    };
  if (!state.audited)
    return {
      step: 1,
      title: 'Planning from the story',
      body: 'Checking the page and choosing what matters for this goal.',
      focus: null,
    };

  const passes = guidedPasses(state);
  const dir = passes.find((p) => p.defId === 'direction');
  const rest = passes.filter((p) => p.defId !== 'direction');
  const next = (state.currentVersion ?? 1) + 1;

  if (dir && undecided(dir)) {
    const v = dir.variants.find((x) => x.id === dir.chosenVariantId);
    return {
      step: 2,
      title: 'Pick a direction',
      body: 'Three takes on your story. Hover each to see it on your page, click the one that feels right, then keep it. A bold one often grows on you, so give it a second look.',
      focus: dir,
      primary:
        dir.baseStatus === 'stale'
          ? { label: 'Regenerate', action: 'regenerate' }
          : {
              label: v ? `Keep ${v.label.split(' · ').pop()}` : 'Keep this direction',
              action: 'keep',
            },
      secondary: [
        { label: 'Skip', action: 'skip' },
        { label: 'Show me others', action: 'reroll', tone: 'tertiary' },
      ],
    };
  }

  const open = rest.filter(undecided);
  const decided = rest.length - open.length;
  if (open.length) {
    const p = open.find((x) => x.id === selected) ?? open[0];
    const k = rest.indexOf(p) + 1;
    return {
      step: 3,
      title: `Change ${k} of ${rest.length} · ${p.name}`,
      body: p.rationale || p.summary || p.description,
      focus: p,
      progress: { done: decided, total: rest.length },
      primary:
        p.baseStatus === 'stale'
          ? { label: 'Regenerate', action: 'regenerate' }
          : { label: 'Keep it', action: 'keep' },
      secondary: [
        { label: 'Skip it', action: 'skip' },
        ...(p.variants.length ? [{ label: 'Show me others', action: 'reroll' as const, tone: 'tertiary' as const }] : []),
      ],
    };
  }

  const kept = state.passes.filter((p) => p.baseStatus === 'approved').length;
  const skipped =
    rest.filter((p) => p.baseStatus === 'rejected').length +
    (dir?.baseStatus === 'rejected' ? 1 : 0);
  if (kept) {
    return {
      step: 4,
      title: `Save it as v${next}`,
      body: `${kept} change${kept > 1 ? 's' : ''} kept${skipped ? `, ${skipped} skipped` : ''}. Committing writes them as one version; v${state.currentVersion} stays one click away.`,
      focus: null,
      progress: { done: rest.length, total: rest.length },
      primary: { label: `Save as v${next}`, action: 'commit' },
      secondary: skipped
        ? [{ label: 'New options for the skipped ones', action: 'randomize', tone: 'tertiary' }]
        : [],
    };
  }
  // The ending people remember: what was saved, how to step back, what is next.
  const last = state.versions.at(-1);
  const savedCount = last && last.number > 1 ? last.label.split(', ').filter(Boolean).length : 0;
  return {
    step: 5,
    title: state.currentVersion > 1 ? `v${state.currentVersion} is saved` : 'Nothing kept yet',
    body:
      state.currentVersion > 1
        ? `${savedCount} change${savedCount === 1 ? '' : 's'} saved as one commit. Every earlier version is one click away under Versions. To go further, ask for fresh options or change the story.`
        : 'Every change was skipped. Ask for fresh options, raise the noise, or change the story.',
    focus: null,
    primary: { label: 'Fresh options', action: 'randomize' },
    secondary: [{ label: 'Edit the story', action: 'story', tone: 'tertiary' }],
  };
}
