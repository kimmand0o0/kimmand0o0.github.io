import type { Env, EmbeddingsFile, PostChunk } from './types';

// Module-level cache — survives across requests within the same warm Worker
// isolate, avoids re-reading KV on every request.
let cachedEmbeddings: EmbeddingsFile | null = null;

async function loadEmbeddings(env: Env): Promise<EmbeddingsFile> {
  if (cachedEmbeddings) return cachedEmbeddings;

  const raw = await env.APP_KV.get('embeddings:v1', 'json');
  if (!raw) {
    throw new Error(
      'embeddings:v1 not found in KV — run `npm run build-embeddings && npm run upload-embeddings` first'
    );
  }
  cachedEmbeddings = raw as EmbeddingsFile;
  return cachedEmbeddings;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Abstract questions about the blog owner ("똑똑한 사람인가?", "취미가 뭐야?") share
// almost no vocabulary with the About page / private profile's concrete text
// (skills, work history, hobbies as flat facts) — cosine similarity between
// the question and these chunks ends up too low to place in the top-k, so
// pure semantic search alone loses these. There are only a handful of these
// "identity" chunks total, so the cheap fix is to always include them
// alongside the top-k general search results (small, fixed token cost)
// rather than trying to keyword-detect every possible way of asking "what
// kind of person is Haeran". Covers both the public About page and the
// private (url === null) personality notes — see openai-proxy-do.ts sibling
// comment for why private chunks have no url.
const ABOUT_URL_SUFFIX = '/about.html';

function isIdentityChunk(c: PostChunk): boolean {
  return c.url === null || c.url.endsWith(ABOUT_URL_SUFFIX);
}

export async function searchRelevantChunks(
  env: Env,
  questionVector: number[],
  topK = 3
): Promise<PostChunk[]> {
  const { chunks } = await loadEmbeddings(env);

  const scored = chunks.map((c) => ({ chunk: c, score: cosineSimilarity(questionVector, c.vector) }));
  scored.sort((a, b) => b.score - a.score);

  const results = scored.slice(0, topK).map((s) => s.chunk);
  const seenIds = new Set(results.map((c) => c.id));

  for (const c of chunks) {
    if (isIdentityChunk(c) && !seenIds.has(c.id)) {
      results.push(c);
      seenIds.add(c.id);
    }
  }

  return results;
}
