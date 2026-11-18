import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { LLM, LLMMessage, ResolvedConfig } from '../types';

export interface LLMOptions {
  provider?: 'anthropic' | 'openai' | 'local';
  model?: string;
  baseUrl?: string;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

/** Returns an LLM adapter when a key (or a local endpoint) is configured, otherwise undefined. */
export function createLLM(config: ResolvedConfig, cacheDir: string, env: NodeJS.ProcessEnv = process.env): LLM | undefined {
  const provider = config.llm.provider ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : env.SITEMAXXING_LOCAL_LLM ? 'local' : undefined);
  if (!provider) return undefined;
  let inner: LLM | undefined;
  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) inner = anthropic(env.ANTHROPIC_API_KEY, config.llm.model ?? 'claude-sonnet-5-5', config.llm.baseUrl);
  if (provider === 'openai' && env.OPENAI_API_KEY) inner = openaiCompatible('openai', env.OPENAI_API_KEY, config.llm.model ?? 'gpt-4o-mini', config.llm.baseUrl ?? 'https://api.openai.com/v1');
  if (provider === 'local') inner = openaiCompatible('local', env.SITEMAXXING_LOCAL_KEY ?? 'local', config.llm.model ?? env.SITEMAXXING_LOCAL_MODEL ?? 'llama3.1', config.llm.baseUrl ?? env.SITEMAXXING_LOCAL_LLM ?? 'http://localhost:11434/v1');
  if (!inner) return undefined;
  return cached(inner, cacheDir);
}

export function anthropic(apiKey: string, model: string, baseUrl = 'https://api.anthropic.com'): LLM {
  return {
    provider: 'anthropic',
    model,
    async complete(messages, opts = {}) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 600, system: system || undefined, messages: rest }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data: any = await res.json();
      return (data.content ?? []).map((c: any) => c.text ?? '').join('');
    },
  };
}

export function openaiCompatible(provider: string, apiKey: string, model: string, baseUrl: string): LLM {
  return {
    provider,
    model,
    async complete(messages, opts = {}) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 600,
          messages,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}

/** Caches every completion by a hash of its input under `.sitemaxxing/cache/`. */
export function cached(inner: LLM, dir: string): LLM {
  return {
    provider: inner.provider,
    model: inner.model,
    async complete(messages: LLMMessage[], opts) {
      const key = createHash('sha256').update(JSON.stringify({ p: inner.provider, m: inner.model, messages, opts })).digest('hex').slice(0, 24);
      const file = path.join(dir, `${key}.json`);
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).text as string;
      const text = await inner.complete(messages, opts);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ provider: inner.provider, model: inner.model, text }, null, 2));
      return text;
    },
  };
}

/** A deterministic adapter for tests. */
export function fakeLLM(reply: (messages: LLMMessage[]) => string): LLM {
  return { provider: 'fake', model: 'fake', complete: async (m) => reply(m) };
}
