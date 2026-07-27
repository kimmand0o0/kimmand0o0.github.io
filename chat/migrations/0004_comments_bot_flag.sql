-- 만두봇이 단 대댓글을 구분하기 위한 플래그.
-- 봇이 자기 댓글에 다시 답하는 무한 루프를 막는 근거이기도 하다.
ALTER TABLE comments ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
