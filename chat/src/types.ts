export interface Env {
  APP_KV: KVNamespace;
  CHAT_RATE_LIMITER: RateLimit;
  MONTHLY_BUDGET_USD: string;
  ALLOWED_ORIGIN: string;
  CHAT_MODEL: string;
  EMBEDDING_MODEL: string;
  EMBEDDING_DIMENSIONS: string;
  OPENAI_API_KEY: string;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface PostChunk {
  id: string;
  title: string;
  url: string;
  chunk: string;
  vector: number[];
}

export interface EmbeddingsFile {
  model: string;
  dimensions: number;
  generatedAt: string;
  chunks: PostChunk[];
}

export interface ChatRequestBody {
  question: string;
  /** Reserved for future Turnstile integration — unused in v1. */
  turnstileToken?: string;
}

export interface ChatResponseBody {
  answer: string;
  sources: Array<{ title: string; url: string }>;
}
