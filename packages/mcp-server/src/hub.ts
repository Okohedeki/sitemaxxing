import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { WebSocketServer, WebSocket } from 'ws';
import { chromium, type Browser } from 'playwright';
import { Engine, HUB_PORT, type HubEvent, type RpcRequest, type RpcResponse, type PassDefinition } from '@sitemaxxing/core';
import { passes as builtInPasses } from '@sitemaxxing/passes';
import { rules } from '@sitemaxxing/rules';
import { scorePage } from '@sitemaxxing/mog-score';
import { createMcpServer } from './mcp';
import { rpcHandlers } from './rpc';

export interface HubOptions {
  port?: number;
  passes?: PassDefinition[];
  registryFile?: string;
  log?: (msg: string) => void;
  /** Serve a built control room from this directory on `controlRoomPort`. */
  controlRoomDir?: string;
  controlRoomPort?: number;
  versionPortBase?: number;
  /** Folder for sites recreated from a URL, and the template app they start from. */
  sites?: { dir: string; template: string };
}

export interface Hub {
  engine: Engine;
  port: number;
  url: string;
  close(): Promise<void>;
  broadcast(e: HubEvent): void;
}

function overlayPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve('@sitemaxxing/overlay');
  } catch {
    return null;
  }
}

export async function startHub(opts: HubOptions = {}): Promise<Hub> {
  const port = opts.port ?? HUB_PORT;
  const log = opts.log ?? ((m: string) => console.log(`[sitemaxxing] ${m}`));
  let browser: Browser | null = null;
  const clients = new Set<WebSocket>();
  const broadcast = (e: HubEvent) => {
    const msg = JSON.stringify(e);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
  };
  const engine = new Engine({
    passes: opts.passes ?? builtInPasses,
    rules,
    scorer: scorePage as any,
    browser: async () => {
      if (!browser || !browser.isConnected()) browser = await chromium.launch();
      return browser;
    },
    emit: broadcast,
    registryFile: opts.registryFile,
    log,
    versionPortBase: opts.versionPortBase,
    sites: opts.sites,
  });

  const overlayFile = overlayPath();
  const handlers = rpcHandlers(engine);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/overlay.js') {
      if (!overlayFile || !fs.existsSync(overlayFile)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('overlay not built');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
      fs.createReadStream(overlayFile).pipe(res);
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, projects: engine.listProjects() }));
      return;
    }
    if (url.pathname === '/mcp') {
      try {
        const { server: mcp, transport } = await createMcpServer(engine);
        res.on('close', () => {
          transport.close().catch(() => undefined);
          mcp.close().catch(() => undefined);
        });
        let body: unknown = undefined;
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          body = raw ? JSON.parse(raw) : undefined;
        }
        await transport.handleRequest(req, res, body);
      } catch (e) {
        log(`mcp error: ${(e as Error).message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: (e as Error).message }, id: null }));
        }
      }
      return;
    }
    if (url.pathname.startsWith('/api/screenshot/')) {
      // /api/screenshot/<projectId>/<relative path under .sitemaxxing/screenshots>
      const [, , , projectId, ...rest] = url.pathname.split('/');
      const p = engine.listProjects().find((x) => x.id === projectId);
      const rel = rest.join('/');
      if (!p || rel.includes('..')) {
        res.writeHead(404);
        res.end();
        return;
      }
      const file = path.join(p.rootPath, '.sitemaxxing', 'screenshots', rel);
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'image/png' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('sitemaxxing hub');
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    if (url.pathname !== '/live') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'hello', projectId: '', ts: Date.now(), projects: engine.listProjects() } satisfies HubEvent));
    ws.on('close', () => clients.delete(ws));
    ws.on('message', async (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'overlay.hello') return;
      const req = msg as RpcRequest;
      if (typeof req.id !== 'number' || typeof req.method !== 'string') return;
      const reply = (r: RpcResponse) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(r));
      const fn = handlers[req.method];
      if (!fn) return reply({ id: req.id, error: `unknown method ${req.method}` });
      try {
        reply({ id: req.id, result: await fn(req.params ?? {}) });
      } catch (e) {
        const message = (e as Error).message;
        log(`${req.method} failed: ${message}`);
        reply({ id: req.id, error: message });
        broadcast({ type: 'error', projectId: String(req.params?.project_id ?? ''), ts: Date.now(), message });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  let controlRoomServer: http.Server | null = null;
  if (opts.controlRoomDir && fs.existsSync(opts.controlRoomDir)) {
    controlRoomServer = serveStatic(opts.controlRoomDir, opts.controlRoomPort ?? 4747);
  }

  log(`hub on http://localhost:${port}  (mcp: /mcp, ws: /live, overlay: /overlay.js)`);
  return {
    engine,
    port,
    url: `http://localhost:${port}`,
    broadcast,
    async close() {
      for (const c of clients) c.close();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      controlRoomServer?.close();
      await engine.close();
      if (browser) await browser.close();
    },
  };
}

function serveStatic(dir: string, port: number): http.Server {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port, '127.0.0.1');
  return server;
}
