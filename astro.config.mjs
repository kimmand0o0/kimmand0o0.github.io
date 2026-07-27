import { defineConfig } from 'astro/config';

// ```mermaid 펜스를 Shiki가 건드리기 전에 <pre class="mermaid">로 치환한다.
// 클라이언트에서 mermaid.run()이 이 클래스를 찾아 렌더링한다 (기존 Jekyll 대비 동일 동작).
function remarkMermaid() {
  const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const walk = (node, fn) => {
    fn(node);
    if (node.children) node.children.forEach((c) => walk(c, fn));
  };
  return (tree) => {
    walk(tree, (node) => {
      if (node.type === 'code' && node.lang === 'mermaid') {
        node.type = 'html';
        node.value = `<pre class="mermaid">${escapeHtml(node.value)}</pre>`;
        delete node.lang;
      }
    });
  };
}

export default defineConfig({
  site: 'https://kimmand0o0.github.io',
  trailingSlash: 'never',
  // Jekyll의 /path/name.html URL 구조를 그대로 재현하기 위한 file 포맷
  build: { format: 'file' },
  markdown: {
    remarkPlugins: [remarkMermaid],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
