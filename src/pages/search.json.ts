import { allPosts, postPath, postDateParts, categoriesOf, tagsOf } from '../lib/posts';

/** 마크다운/HTML을 대충 벗겨 검색용 발췌를 만든다 (기존 Jekyll search.json의 truncate: 160 재현) */
function excerptOf(body: string | undefined): string {
  if (!body) return '';
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/{%[\s\S]*?%}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export async function GET() {
  const posts = await allPosts();
  const items = posts.map((post) => {
    const { y, m, d } = postDateParts(post);
    return {
      title: post.data.title,
      url: postPath(post),
      date: `${y}-${m}-${d}`,
      categories: categoriesOf(post),
      tags: tagsOf(post),
      excerpt: excerptOf(post.body),
    };
  });
  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
