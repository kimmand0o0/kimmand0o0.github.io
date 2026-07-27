import {
  allPosts,
  postPath,
  postDateParts,
  categoriesOf,
  tagsOf,
  excerptOf,
  readingMinutes,
} from '../lib/posts';

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
      excerpt: excerptOf(post),
      // 홈 무한 스크롤이 서버 렌더 목록과 같은 모양으로 이어붙이기 위해 필요
      minutes: readingMinutes(post),
    };
  });
  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
