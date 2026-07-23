import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

/**
 * Pinned-location proxy for all OpenAI API calls.
 *
 * Cloudflare Workers on *.workers.dev execute at whatever edge colo is
 * closest to the incoming request — which can land on a colo in a region
 * OpenAI blocks (Hong Kong, mainland China, etc.), causing intermittent
 * "unsupported_country_region_territory" 403s purely based on which colo
 * happened to serve a given visitor (observed in production: a request from
 * a Korean visitor landed on Cloudflare's HKG colo and got rejected).
 *
 * A Durable Object, once created, stays pinned to wherever it was first
 * instantiated. Routing every OpenAI call through a single DO created with
 * locationHint "wnam" (western North America — squarely OpenAI-supported)
 * makes every OpenAI call originate from one consistent, allowed region,
 * regardless of where the visitor or the incoming request's colo is.
 *
 * The OpenAI API key never leaves this class — callers send only
 * { path, body }, and this DO attaches auth itself.
 */
export class OpenAiProxyDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const { path, body } = (await request.json()) as { path: string; body: unknown };

    return fetch(`https://api.openai.com${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
}
