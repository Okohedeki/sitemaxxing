import { useMemo, useState } from 'react';
import type { Brief, Goal } from '@sitemaxxing/core/protocol';
import { GOALS, GOAL_IDS, describeMood, moodOf, DEFAULT_NOISE } from '@sitemaxxing/core/protocol';

const FEELINGS = ['calm', 'bold', 'warm', 'cool', 'precise', 'playful', 'serious', 'classic', 'modern', 'rugged', 'minimal', 'rich', 'dark', 'bright', 'luxurious', 'friendly'];

export interface StoryDraft {
  story: string;
  audience: string;
  goal: Goal;
  feeling: string[];
  keep: { colors?: boolean; fonts?: boolean; copy?: boolean };
  avoid: string[];
  noise: number;
}

export function draftFrom(brief: Brief | null): StoryDraft {
  return {
    story: brief?.story ?? '',
    audience: brief?.audience ?? '',
    goal: brief?.goal ?? 'signups',
    feeling: brief?.feeling ?? [],
    keep: brief?.keep ?? {},
    avoid: brief?.avoid ?? [],
    noise: brief?.noise ?? DEFAULT_NOISE,
  };
}

/** Step 1. Nothing is planned until the owner says what this is, who it is for and what it must do. */
export function StoryForm({ brief, busy, onSubmit, onCancel }: { brief: Brief | null; busy: boolean; onSubmit: (d: StoryDraft) => void; onCancel?: () => void }) {
  const [d, setD] = useState<StoryDraft>(() => draftFrom(brief));
  const [custom, setCustom] = useState('');
  const set = <K extends keyof StoryDraft>(k: K, v: StoryDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const feeling = useMemo(() => [...new Set([...d.feeling, ...custom.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)])], [d.feeling, custom]);
  const mood = useMemo(() => describeMood(moodOf({ story: d.story, audience: d.audience, feeling, avoid: d.avoid })), [d.story, d.audience, feeling, d.avoid]);
  const ready = d.story.trim().length >= 12;
  const toggle = (f: string) => set('feeling', d.feeling.includes(f) ? d.feeling.filter((x) => x !== f) : [...d.feeling, f].slice(0, 6));
  const noiseWord = d.noise < 0.2 ? 'Safe' : d.noise < 0.45 ? 'Considered' : d.noise < 0.7 ? 'Adventurous' : 'Wild';

  return (
    <form
      className="story"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit({ ...d, feeling });
      }}
    >
      <div className="story-head">
        <h2>Start with the story</h2>
        <p>Sitemaxxing plans the changes from this. Two sites with different stories should not end up looking alike.</p>
      </div>

      <label className="field">
        <span>What is it, and why does it exist?</span>
        <textarea rows={3} value={d.story} onChange={(e) => set('story', e.target.value)} placeholder="e.g. A neighbourhood bike shop that fixes any bike in a day and rents cargo bikes by the hour." />
      </label>

      <label className="field">
        <span>Who is it for?</span>
        <input value={d.audience} onChange={(e) => set('audience', e.target.value)} placeholder="e.g. commuters and parents in the north end" />
      </label>

      <fieldset className="field">
        <legend>What should a visitor do?</legend>
        <div className="chips" role="radiogroup">
          {GOAL_IDS.map((g) => (
            <button type="button" key={g} role="radio" aria-checked={d.goal === g} aria-pressed={d.goal === g} onClick={() => set('goal', g)}>
              {GOALS[g].label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>How should it feel?</legend>
        <div className="chips">
          {FEELINGS.map((f) => (
            <button type="button" key={f} aria-pressed={d.feeling.includes(f)} onClick={() => toggle(f)}>
              {f}
            </button>
          ))}
        </div>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="your own words, comma separated" aria-label="Your own feeling words" />
        <div className="mood" aria-live="polite">
          Reads as <b>{mood.join(' · ')}</b>
        </div>
      </fieldset>

      <fieldset className="field row2">
        <legend>Keep as it is</legend>
        {(['colors', 'fonts', 'copy'] as const).map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={!!d.keep[k]} onChange={(e) => set('keep', { ...d.keep, [k]: e.target.checked })} />
            {k === 'colors' ? 'Colours' : k === 'fonts' ? 'Fonts' : 'Copy'}
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span>Avoid</span>
        <input value={d.avoid.join(', ')} onChange={(e) => set('avoid', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="e.g. no dark mode, nothing that moves" />
      </label>

      <label className="field">
        <span>
          Noise <em>{noiseWord}</em>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={d.noise} onChange={(e) => set('noise', Number(e.target.value))} aria-valuetext={noiseWord} />
        <div className="scale">
          <small>Safe: stay close to the brief</small>
          <small>Wild: reach for inspiration</small>
        </div>
      </label>

      <div className="story-actions">
        <button className="btn primary" type="submit" disabled={!ready || busy}>
          {brief ? 'Re-plan the glow-up' : 'Plan the glow-up'}
        </button>
        {onCancel ? (
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function StoryCard({ brief, mood, onEdit }: { brief: Brief; mood: string[]; onEdit: () => void }) {
  return (
    <div className="storycard">
      <div>
        <small>Story · {GOALS[brief.goal].label}</small>
        <p title={brief.story}>{brief.story}</p>
        <span className="tags">
          {mood.join(' · ')} · noise {Math.round(brief.noise * 100)}% · seed {brief.seed.toString(36)}
        </span>
      </div>
      <button className="btn small" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}
