import { allPosts, postPath, postDateParts, categoriesOf, tagsOf, excerptOf } from '../lib/posts';

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
    };
  });
  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
