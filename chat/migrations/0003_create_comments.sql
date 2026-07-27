-- 블로그 댓글 — 외부 서비스 없이 이 워커가 직접 받는다.
-- 로그인 없는 익명 댓글이므로 스팸 방어는 레이트리밋 + 길이 제한 + 수동 숨김으로 한다.
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- 원문 IP 는 저장하지 않는다. 반복 스팸 추적용 해시만 남긴다.
  ip_hash TEXT,
  -- 1 이면 화면에서 감춘다 (삭제 대신 숨김 — 되돌릴 수 있게)
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comments_path ON comments (path, id);
