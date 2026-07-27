import { allPosts, postPath, postDateParts, SITE } from '../lib/posts';

const STATIC_PAGES = ['/', '/about.html', '/tags.html', '/categories.html', '/archives.html', '/search.html'];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET() {
  const posts = await allPosts();
  const urls = [
    ...STATIC_PAGES.map((p) => `  <url><loc>${SITE.url}${p}</loc></url>`),
    ...posts.map((post) => {
      const { y, m, d } = postDateParts(post);
      // 공백·한글 경로는 encodeURI로 (Jekyll sitemap과 동일하게 %20 인코딩)
      return `  <url><loc>${esc(encodeURI(SITE.url + postPath(post)))}</loc><lastmod>${y}-${m}-${d}</lastmod></url>`;
    }),
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
