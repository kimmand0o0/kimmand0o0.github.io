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

export async function allPosts(): Promise<Post[]> {
  const posts = await getCollection('posts');
  return posts.sort((a, b) => postDate(b).getTime() - postDate(a).getTime());
}

export const PER_PAGE = 5;
