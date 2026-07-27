import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export const SITE = {
  title: "Haeran's blog",
  description: '문제의 본질을 파악하고 해결하는 과정을 기록합니다.',
  author: 'Haeran',
  url: 'https://kimmand0o0.github.io',
} as const;

const KST_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 프론트매터 date를 실제 Date로. "YYYY-MM-DD HH:MM:SS +0900" 문자열 형식 지원 */
export function postDate(post: Post): Date {
  const raw = post.data.date;
  if (raw instanceof Date) return raw;
  const m = String(raw).match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(?:\s*([+-])(\d{2}):?(\d{2}))?/
  );
  if (!m) return new Date(String(raw));
  const [, y, mo, d, hh = '00', mi = '00', ss = '00', sign, tzh, tzm] = m;
  const tz = sign ? `${sign}${tzh}:${tzm ?? '00'}` : '+09:00';
  return new Date(`${y}-${mo}-${d}T${hh}:${mi}:${ss}${tz}`);
}

/** URL·표기에 쓰는 날짜 파트. 문자열이면 리터럴 그대로(Jekyll과 동일), Date면 KST 기준 */
export function postDateParts(post: Post): { y: string; m: string; d: string } {
  const raw = post.data.date;
  if (typeof raw === 'string') {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: m[1], m: m[2], d: m[3] };
  }
  const [y, m, d] = KST_DATE.format(postDate(post)).split('-');
  return { y, m, d };
}

/** 파일명에서 날짜 프리픽스를 뗀 슬러그. 한글·대소문자·점·언더스코어 보존 (Jekyll 동작 재현) */
export function postSlug(post: Post): string {
  const file = post.id.split('/').pop() ?? post.id;
  return file.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

export function categoriesOf(post: Post): string[] {
  const c = post.data.categories;
  if (Array.isArray(c)) return c.filter(Boolean);
  return String(c).split(/[,\s]+/).filter(Boolean);
}

export function tagsOf(post: Post): string[] {
  const t = post.data.tags;
  if (Array.isArray(t)) return t.filter(Boolean);
  return String(t).split(/[,\s]+/).filter(Boolean);
}

/**
 * Jekyll 기본 permalink(/:categories/:year/:month/:day/:title.html) 재현.
 * 카테고리는 소문자화하되 공백은 보존한다 — 예: "journal/development diary/2026/07/27/slug.html"
 */
export function postPath(post: Post): string {
  const { y, m, d } = postDateParts(post);
  const cats = categoriesOf(post).map((c) => c.toLowerCase());
  return '/' + [...cats, y, m, d, postSlug(post)].join('/') + '.html';
}

export function formatDate(post: Post): string {
  const { y, m, d } = postDateParts(post);
  return `${y}.${m}.${d}`;
}

/** 마크다운/HTML을 벗겨낸 본문 발췌 (목록 미리보기·검색용) */
export function excerptOf(post: Post, length = 160): string {
  const body = post.body ?? '';
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/{%[\s\S]*?%}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}

/**
 * 한국어 기준 대략적인 읽는 시간 (분당 500자).
 * 코드 블록·표는 눈으로 훑는 속도가 산문과 달라 글자 수에서 뺀다.
 */
export function readingMinutes(post: Post): number {
  const prose = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, ' ') // 코드 블록
    .replace(/^\s*\|.*\|\s*$/gm, ' '); // 표 행
  const chars = prose.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 500));
}

/** 목록·헤더에 쓰는 짧은 표기 */
export function readingLabel(post: Post): string {
  return `${readingMinutes(post)}분 분량`;
}

/** 마우스를 올렸을 때 뜨는 설명 */
export function readingTip(post: Post): string {
  return `이 게시글을 읽는 데 ${readingMinutes(post)}분 정도 걸릴 것 같아요!`;
}

/**
 * 제목에서 시리즈명과 회차를 뽑는다. 이 블로그에 실제로 쓰인 세 가지 형태만 인식한다:
 *   [ 롤모임 운영일지 ] - 22. 부제
 *   LLM 프롬프팅 논문 스터디 - 07. 부제
 *   데이터독(Datadog) 학습 정리 (6) - 부제
 * 못 알아보면 null — 시리즈가 아닌 단독 글이다.
 */
export function seriesOf(post: Post): { name: string; no: number } | null {
  const title = post.data.title;
  const bracket = title.match(/^\[\s*(.+?)\s*\]\s*[-–—]\s*(\d+)\.\s*/);
  if (bracket) return { name: bracket[1], no: Number(bracket[2]) };

  const paren = title.match(/^(.+?)\s*\((\d+)\)\s*[-–—]\s*/);
  if (paren) return { name: paren[1], no: Number(paren[2]) };

  const plain = title.match(/^(.+?)\s+[-–—]\s*(\d+)\.\s*/);
  if (plain) return { name: plain[1], no: Number(plain[2]) };

  return null;
}

export type SeriesNav = {
  name: string;
  index: number; // 1부터
  total: number;
  prev: { title: string; url: string } | null;
  next: { title: string; url: string } | null;
};

/** 같은 시리즈 글들을 회차 순으로 세워 현재 글의 앞뒤를 찾는다 */
export function seriesNavFor(post: Post, posts: Post[]): SeriesNav | null {
  const me = seriesOf(post);
  if (!me) return null;

  const siblings = posts
    .map((p) => ({ p, s: seriesOf(p) }))
    .filter((x): x is { p: Post; s: { name: string; no: number } } => x.s?.name === me.name)
    .sort((a, b) => a.s.no - b.s.no);

  if (siblings.length < 2) return null; // 혼자면 시리즈로 보지 않는다

  const at = siblings.findIndex((x) => x.p.id === post.id);
  const link = (x?: { p: Post }) => (x ? { title: x.p.data.title, url: postPath(x.p) } : null);

  return {
    name: me.name,
    index: at + 1,
    total: siblings.length,
    prev: link(siblings[at - 1]),
    next: link(siblings[at + 1]),
  };
}

export async function allPosts(): Promise<Post[]> {
  const posts = await getCollection('posts');
  return posts.sort((a, b) => postDate(b).getTime() - postDate(a).getTime());
}

export const PER_PAGE = 5;
