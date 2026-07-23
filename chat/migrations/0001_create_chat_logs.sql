-- Migration number: 0001 	 2026-07-23T06:24:21.358Z

-- 만두봇 대화 전량 로그 (정상 응답 + 가드에 막힌 시도 모두 포함).
-- blocked=1인 행은 answer/sources/cost/latency가 비어있고 guard_category만 채워짐.
CREATE TABLE chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  question TEXT NOT NULL,
  answer TEXT,
  sources TEXT,          -- JSON array of {title, url}, null when blocked
  blocked INTEGER NOT NULL DEFAULT 0,
  guard_category TEXT,   -- jailbreak / ooc-injection / prompt-extraction / secret-fishing / obfuscation
  ip TEXT,
  user_agent TEXT,
  referrer TEXT,
  chat_model TEXT,
  embedding_model TEXT,
  cost_usd REAL,
  latency_ms INTEGER
);

CREATE INDEX idx_chat_logs_created_at ON chat_logs (created_at);
CREATE INDEX idx_chat_logs_blocked ON chat_logs (blocked);
