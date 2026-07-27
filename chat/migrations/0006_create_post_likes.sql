-- 글 추천(따봉) 수. 로그인이 없으므로 "한 사람 한 번"은 브라우저(localStorage)가 기억하고,
-- 서버는 합계만 들고 있는다. 완벽한 중복 방지는 아니지만 로그인 없이 할 수 있는 선까지다.
CREATE TABLE IF NOT EXISTS post_likes (
  path TEXT PRIMARY KEY,
  likes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_likes_likes ON post_likes (likes DESC);
