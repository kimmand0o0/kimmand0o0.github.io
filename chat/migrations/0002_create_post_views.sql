-- 블로그 글 조회수 집계 — 검색 페이지의 "많이 본 글" 목록 소스
CREATE TABLE IF NOT EXISTS post_views (
  path TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_views_views ON post_views (views DESC);
