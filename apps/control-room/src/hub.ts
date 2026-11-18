import type { HubEvent, RpcResponse } from '@sitemaxxing/core/protocol';

type Listener = (e: HubEvent) => void;

/** Thin WebSocket client: request/response RPC plus an event stream. Reconnects on its own. */
export class HubClient {
  private ws: WebSocket | null = null;
  private seq = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();
  private retry = 0;
  private queue: string[] = [];
  connected = false;

  constructor(public url: string) {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      setTimeout(() => this.connect(), 1500);
      return;
    }
    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.retry = 0;
      for (const q of this.queue) this.ws!.send(q);
      this.queue = [];
      this.emit({ type: 'busy', projectId: '', ts: Date.now(), what: null });
    });
    this.ws.addEventListener('close', () => {
      this.connected = false;
      for (const p of this.pending.values()) p.reject(new Error('hub disconnected'));
      this.pending.clear();
      setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retry++));
    });
    this.ws.addEventListener('message', (m) => {
      let data: any;
      try {
        data = JSON.parse(m.data);
      } catch {
        return;
      }
      if (typeof data.id === 'number' && ('result' in data || 'error' in data)) {
        const r = data as RpcResponse;
        const p = this.pending.get(r.id);
        if (!p) return;
        this.pending.delete(r.id);
        if (r.error) p.reject(new Error(r.error));
        else p.resolve(r.result);
        return;
      }
      if (data.type) this.emit(data as HubEvent);
    });
  }

  private emit(e: HubEvent) {
    for (const l of this.listeners) l(e);
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.seq++;
    const msg = JSON.stringify({ id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(msg);
      else this.queue.push(msg);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 120_000);
    });
  }
}

export const hubUrl = (() => {
  const q = new URLSearchParams(location.search).get('hub');
  if (q) return q.replace(/^http/, 'ws').replace(/\/$/, '') + '/live';
  return 'ws://localhost:3333/live';
})();

export const hubHttp = hubUrl.replace(/^ws/, 'http').replace(/\/live$/, '');
