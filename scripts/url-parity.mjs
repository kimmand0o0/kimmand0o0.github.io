// gh-pages(구 Jekyll 빌드) 산출물과 Astro dist/ 산출물의 URL parity 검증.
// 사용: node scripts/url-parity.mjs  (사전에 git fetch origin gh-pages + npm run build)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');

// Jekyll이 gh-pages에 복사했지만 실제 사이트 URL이 아니거나, 새 스택에서 의도적으로 대체/폐기한 파일
const IGNORE = [
  /^\.nojekyll$/,
  /^LICENSE\.txt$/,
  /^README\.md$/,
  /^jekyll-theme-yat\.gemspec$/,
  /^assets\/css\//, // Astro가 자체 번들 CSS 생성
  /^assets\/css\/main\.css\.map$/,
  /^assets\/js\/main\.js$/, // yat 테마 전용 JS — 새 디자인에서 미사용
  // Astro가 내용 해시로 이름 짓는 번들 — 빌드마다 파일명이 바뀌는 게 정상이다.
  // 이 스크립트가 지키려는 건 "글 URL이 안 깨졌는가"이지 자산 파일명이 아니다.
  /^_astro\//,
];

// core.quotePath=false: 한글 경로가 "\354..." 옥탈 이스케이프로 인용되는 것 방지
const raw = execSync('git -c core.quotePath=false ls-tree -r origin/gh-pages --name-only', {
  encoding: 'utf8',
});
const expected = raw
  .split('\n')
  .filter(Boolean)
  .filter((p) => !IGNORE.some((re) => re.test(p)));

let missing = [];
for (const path of expected) {
  // macOS 로컬 빌드는 한글 경로가 NFD로 저장될 수 있다 (git은 NFC).
  // 실제 배포는 Linux CI라 NFC로 나오므로, 로컬 검증에서는 두 정규화 형태 모두 허용.
  const candidates = [path, path.normalize('NFC'), path.normalize('NFD')];
  if (!candidates.some((p) => existsSync(join(DIST, p)))) missing.push(path);
}

console.log(`검사 대상: ${expected.length}개 (gh-pages 기준, 제외 규칙 ${IGNORE.length}개 적용)`);
if (missing.length === 0) {
  console.log('✅ PARITY OK — 기존 URL 전부 dist/에 존재');
} else {
  console.log(`❌ MISSING ${missing.length}개:`);
  missing.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
