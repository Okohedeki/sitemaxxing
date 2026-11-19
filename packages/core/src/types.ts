/* Core types shared by every package. Keep this file free of Node imports. */

export type PassKind = 'direction' | 'refine' | 'component';

export type PassStatus =
  | 'proposed'
  | 'previewing'
  | 'approved'
  | 'rejected'
  | 'stale'
  | 'skipped'
  | 'committed';

export type DecisionAction = 'preview' | 'pick' | 'approve' | 'reject' | 'regenerate' | 'commit';

export type ReasonChip = 'too busy' | 'too plain' | 'off-brand' | 'too trendy';

export type VariantSource = 'rule' | 'library' | 'generated' | 'plugin';

/** The one thing a visitor should do. Drives which passes matter and how they are written. */
export type Goal = 'signups' | 'sales' | 'bookings' | 'leads' | 'credibility' | 'awareness';

/** What a pass improves. The planner weighs these against the goal. */
export type Serve = 'clarity' | 'action' | 'trust' | 'character' | 'mood' | 'polish';

/**
 * Where a brief sits on six axes, each from -1 to 1. Derived from the story and feeling words.
 * energy: calm → bold; warmth: cool → warm; formality: playful → serious;
 * classic: contemporary → classic; density: airy → dense; dark: light → dark.
 */
export interface Mood {
  energy: number;
  warmth: number;
  formality: number;
  classic: number;
  density: number;
  dark: number;
}

/** The owner's story. Required before an audit: nothing is planned without it. */
export interface Brief {
  /** What this is and why it exists, in the owner's words. */
  story: string;
  /** Who it is for. */
  audience: string;
  goal: Goal;
  /** How it should feel: a few words such as calm, bold, warm, precise, playful, rugged. */
  feeling: string[];
  /** What must not change. */
  keep: { colors?: boolean; fonts?: boolean; copy?: boolean };
  /** Free-text things to avoid ("no dark mode", "nothing that moves"). */
  avoid: string[];
  /** 0 = stay close to the safest reading of the brief, 1 = wander far for inspiration. */
  noise: number;
  /** Generation seed. Randomize changes it; the same seed reproduces the same proposals. */
  seed: number;
}

export interface SitemaxxingConfig {
  devUrl: string;
  /** Path to the copy file (JSON) relative to the repo root. */
  content?: string;
  sections?: 'auto' | string[];
  passes?: string[];
  llm?: { provider?: 'anthropic' | 'openai' | 'local'; model?: string; baseUrl?: string };
  viewports?: Array<[number, number]>;
  /** Source files the passes may edit, relative to the repo root. */
  sources?: { app?: string; styles?: string; tokens?: string; fonts?: string };
  category?: string;
  /** Optional starting brief (the control room's Story step can edit it). */
  brief?: Partial<Brief>;
}

export interface ResolvedConfig extends Required<Omit<SitemaxxingConfig, 'llm' | 'sources' | 'category' | 'brief'>> {
  llm: { provider?: 'anthropic' | 'openai' | 'local'; model?: string; baseUrl?: string };
  sources: { app: string; styles: string; tokens: string; fonts: string };
  category?: string;
  brief?: Partial<Brief>;
}

export interface Project {
  id: string;
  name: string;
  mode: 'repo' | 'url';
  rootPath: string;
  devUrl: string;
  category?: string;
  createdAt: string;
}

export interface Section {
  id: string;
  projectId: string;
  kind: string;
  selector: string;
  order: number;
}

export interface Finding {
  message: string;
  selector?: string;
  severity?: 'info' | 'warn';
}

export interface Variant {
  id: string;
  label: string;
  /** Inline SVG markup for the thumbnail. */
  thumbnail: string;
  attributes?: Record<string, number | string>;
  source?: VariantSource;
}

export interface PatchFile {
  /** Repo-relative path, posix separators. */
  path: string;
  /** Contents before; empty string for a new file. */
  before: string;
  /** Contents after; empty string to delete the file. */
  after: string;
}

export interface CopyChange {
  key: string;
  old: string;
  new: string;
  /** CSS selector for the element showing this copy, when known. */
  selector?: string;
}

export interface Patch {
  summary: string;
  files: PatchFile[];
  copyDiff?: CopyChange[];
  notes?: string[];
}

export interface SnapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapNode {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  selector: string;
  box: SnapBox;
  styles: Record<string, string>;
  attrs: Record<string, string>;
  depth: number;
  index: number;
  parent: number;
  children: number[];
}

export interface SnapshotDOM {
  url: string;
  viewport: { width: number; height: number };
  nodes: SnapNode[];
  bodyFontSize: number;
  fonts: string[];
  title: string;
  /** Nodes whose box intersects the first viewport. */
  aboveFold(): SnapNode[];
  query(selector: string): SnapNode[];
  byTag(tag: string): SnapNode[];
  first(selector: string): SnapNode | undefined;
  textOf(selector: string): string;
  parentOf(node: SnapNode): SnapNode | undefined;
  childrenOf(node: SnapNode): SnapNode[];
}

export interface DesignTokens {
  file?: string;
  vars: Record<string, string>;
}

export interface FileSystem {
  read(path: string): string;
  exists(path: string): boolean;
  list(dir: string, ext?: string): string[];
  root: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLM {
  provider: string;
  model: string;
  complete(messages: LLMMessage[], opts?: { maxTokens?: number; json?: boolean }): Promise<string>;
}

export interface ContentFile {
  path: string;
  data: Record<string, unknown>;
}

export interface PassContext {
  project: Project;
  config: ResolvedConfig;
  section?: Section;
  files: FileSystem;
  dom: SnapshotDOM;
  tokens: DesignTokens;
  llm?: LLM;
  content?: ContentFile;
  /** Variant chosen for every pass so far (pass def id -> variant id). */
  choices: Record<string, string>;
  /** Pass def ids currently applied in the working tree. */
  applied: string[];
  /** The owner's story; every pass should read it. */
  brief: Brief;
  mood: Mood;
  /** Per-pass generation seed (pass def id -> seed). Use `rngFor(ctx, passId)`. */
  seeds: Record<string, number>;
}

export interface RuleCard {
  id: string;
  passes: string[];
  principle: string;
  detect: string;
  fix: string;
  source: { title: string; author: string; url: string };
  kind: 'blog' | 'book' | 'paper';
}

export interface ForceState {
  selector: string;
  state: 'open' | 'hover';
}

export interface PassDefinition {
  id: string;
  name: string;
  kind: PassKind;
  order: number;
  /** What this pass improves; the planner weighs it against the brief's goal. */
  serves: Serve[];
  /** Moods this pass suits (positive) or fights (negative); e.g. motion passes lean energetic. */
  moodBias?: Partial<Mood>;
  /** @deprecated v0.1 fixed gain. Ignored by the planner; impact is computed per brief. */
  points?: number;
  dependsOn?: string[];
  ruleCards: string[];
  /** One-line description shown in the queue row. */
  description: string;
  detect(ctx: PassContext): Promise<{ applies: boolean; findings: Finding[]; reason?: string }>;
  variants?(ctx: PassContext): Promise<Variant[]>;
  /** Must change ONE thing. */
  propose(ctx: PassContext, variantId?: string): Promise<Patch>;
  /** Selectors to outline in the overlay. */
  highlight(ctx: PassContext, variantId?: string): string[];
  forceState?: ForceState;
  /** Whether the overlay should replay an entrance when previewing. */
  replay?: boolean;
  copyDiff?(ctx: PassContext): Array<{ key: string; old: string; new: string }>;
}

export interface VersionRow {
  id: string;
  projectId: string;
  number: number;
  gitSha: string;
  mogScore: number;
  passIds: string[];
  variantMap: Record<string, string>;
  screenshots: Record<string, string>;
  createdAt: string;
}

export interface ScoreResult {
  score: number;
  metrics: Record<string, { value: number; sub: number; weight: number; note: string }>;
  notes: string[];
}

export interface PassView {
  id: string;
  defId: string;
  name: string;
  kind: PassKind;
  order: number;
  /** 0–100: how much this pass matters for this brief and this page. */
  impact: number;
  /** One line on why it matters for this goal. */
  rationale: string;
  seed: number;
  status: PassStatus;
  /** The stored status, unaffected by a transient preview. */
  baseStatus: PassStatus;
  description: string;
  chosenVariantId?: string;
  variants: Variant[];
  findings: Finding[];
  skipReason?: string;
  dependsOn: string[];
  ruleCards: string[];
  copyDiff?: CopyChange[];
  summary?: string;
  forceState?: ForceState;
  replay?: boolean;
  highlight: string[];
  /** The owner's latest "why not?" answer for this pass, if any. */
  reason?: ReasonChip;
  /** How the owner's answers lean this pass's next options ("calmer", "closer to the brief"). */
  lean: string[];
}

export interface VersionView {
  number: number;
  score: number;
  sha: string;
  label: string;
  createdAt: string;
}

export interface ProjectState {
  project: Project;
  baseline: number;
  score: ScoreResult | null;
  passes: PassView[];
  versions: VersionView[];
  currentVersion: number;
  view: 'current' | 'changes';
  previewing: { passId: string; variantId?: string } | null;
  viewingVersion: number | null;
  versionUrl: string | null;
  audited: boolean;
  busy: string | null;
  brief: Brief | null;
  mood: Mood | null;
}
