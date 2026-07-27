// _posts 안의 {% post_url ... %} Liquid 태그를 실제 절대경로로 치환한다.
// Jekyll 이탈 후에는 Liquid가 해석되지 않으므로 컷오버 전에 반드시 실행.
// 사용: node scripts/fix-post-urls.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const POSTS_DIR = join(process.cwd(), '_posts');
const dry = process.argv.includes('--dry');

// 모든 포스트의 "날짜-슬러그" → URL 매핑 구축 (src/lib/posts.ts와 동일한 규칙)
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

function frontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  const dateM = m[1].match(/^date:\s*(\d{4})-(\d{2})-(\d{2})/m);
  if (dateM) fm.date = [dateM[1], dateM[2], dateM[3]];
  const catM = m[1].match(/^categories:\s*\[([^\]]*)\]/m);
  if (catM) fm.categories = catM[1].split(',').map((s) => s.trim());
  return fm;
}

const urlByKey = new Map(); // "2026-07-27-slug" → "/journal/.../slug.html"
for (const file of walk(POSTS_DIR)) {
  const src = readFileSync(file, 'utf8');
  const fm = frontmatter(src);
  if (!fm.date || !fm.categories) continue;
  const base = file.split('/').pop().replace(/\.md$/, '');
  const slug = base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const cats = fm.categories.map((c) => c.toLowerCase());
  const [y, mo, d] = fm.date;
  urlByKey.set(base, '/' + [...cats, y, mo, d, slug].join('/') + '.html');
}

let totalFiles = 0;
let totalRepl = 0;
const unresolved = [];
for (const file of walk(POSTS_DIR)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('post_url')) continue;
  let count = 0;
  const out = src.replace(/\{%\s*post_url\s+([^\s%]+)\s*%\}/g, (whole, ref) => {
    // "2026-07/2026-07-22-slug" 와 "2026-07-22-slug" 두 형식 모두 지원
    const key = ref.split('/').pop();
    const url = urlByKey.get(key);
    if (!url) {
      unresolved.push(`${file}: ${ref}`);
      return whole;
    }
    count++;
    // 경로에 공백이 있으므로 마크다운 링크 안에서 안전하도록 URL 인코딩
    return encodeURI(url);
  });
  if (count > 0) {
    totalFiles++;
    totalRepl += count;
    if (!dry) writeFileSync(file, out);
    console.log(`${dry ? '[dry] ' : ''}${file}: ${count}건 치환`);
  }
}

console.log(`\n합계: ${totalFiles}개 파일, ${totalRepl}건 치환`);
if (unresolved.length) {
  console.log(`❌ 미해결 참조 ${unresolved.length}건:`);
  unresolved.forEach((u) => console.log('  - ' + u));
  process.exit(1);
}
