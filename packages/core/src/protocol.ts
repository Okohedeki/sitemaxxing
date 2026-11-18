/* WebSocket events and RPC shapes shared by the hub, the control room and the overlay.
   No Node imports: this file is bundled into browser code. */

import type { ProjectState, PassStatus, CopyChange, ScoreResult, ReasonChip } from './types';

export const HUB_PORT = 3333;
export const CONTROL_ROOM_PORT = 4747;

export type HubEvent =
  | { type: 'audit.done'; projectId: string; ts: number; score: number }
  | {
      type: 'pass.previewed';
      projectId: string;
      ts: number;
      passId: string;
      variantId?: string;
      selectors: string[];
      label: string;
      forceState?: { selector: string; state: 'open' | 'hover' };
      replay?: boolean;
      copyDiff?: CopyChange[];
    }
  | { type: 'preview.ended'; projectId: string; ts: number; passId?: string }
  | { type: 'pass.decided'; projectId: string; ts: number; passId: string; status: PassStatus }
  | { type: 'copy.changed'; projectId: string; ts: number; key: string; old: string; new: string; selector?: string }
  | { type: 'pass.reported'; projectId: string; ts: number; name: string; selectors: string[] }
  | { type: 'pass.stale'; projectId: string; ts: number; passIds: string[] }
  | { type: 'version.committed'; projectId: string; ts: number; number: number; sha: string; score: number }
  | { type: 'score.updated'; projectId: string; ts: number; score: number; delta: number; metrics?: ScoreResult['metrics'] }
  | { type: 'state'; projectId: string; ts: number; state: ProjectState }
  | { type: 'busy'; projectId: string; ts: number; what: string | null }
  | { type: 'hello'; projectId: ''; ts: number; projects: Array<{ id: string; name: string; devUrl: string }> }
  | { type: 'error'; projectId: string; ts: number; message: string };

export type HubEventType = HubEvent['type'];

export interface RpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  id: number;
  result?: unknown;
  error?: string;
}

export interface DecisionMeta {
  dwellMs?: number;
  shownAlongside?: string[];
  reasonChip?: ReasonChip;
}

export const REASON_CHIPS: ReasonChip[] = ['too busy', 'too plain', 'off-brand', 'too trendy'];

/** Messages the overlay sends back to the hub (none are required for v1). */
export type OverlayMessage = { type: 'overlay.ready'; url: string };
