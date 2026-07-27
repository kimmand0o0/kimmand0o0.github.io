import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { allPosts, postPath, postDate, SITE } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = (await allPosts()).slice(0, 20);
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: posts.map((post) => ({
      title: post.data.title,
      link: postPath(post),
      pubDate: postDate(post),
    })),
    customData: '<language>ko</language>',
  });
}
