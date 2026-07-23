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

export async function searchRelevantChunks(
  env: Env,
  questionVector: number[],
  topK = 3
): Promise<PostChunk[]> {
  const { chunks } = await loadEmbeddings(env);

  const scored = chunks.map((c) => ({ chunk: c, score: cosineSimilarity(questionVector, c.vector) }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => s.chunk);
}
