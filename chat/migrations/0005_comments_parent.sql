-- 대댓글 — 어떤 댓글에 달린 답글인지 가리킨다. NULL 이면 최상위 댓글.
-- 깊이는 1단계만 쓴다(답글의 답글도 같은 부모에 붙인다) — 화면이 계단처럼 깊어지지 않게.
ALTER TABLE comments ADD COLUMN parent_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
