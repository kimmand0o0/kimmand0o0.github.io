import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 기존 Jekyll _posts/ 구조와 프론트매터를 변환 없이 그대로 읽는다.
// devlog 자동화·동시 세션들의 글쓰기 규약(_posts/YYYY-MM/YYYY-MM-DD-slug.md)이 유지되는 이유.
const posts = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './_posts',
    // 기본 generateId는 슬러그화를 거치므로, 한글·대소문자·언더스코어가 보존되도록 원본 경로를 그대로 쓴다
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z
    .object({
      title: z.string(),
      // YAML 파서가 Date로 읽는 경우와 "+0900" 문자열로 남는 경우 둘 다 허용
      date: z.union([z.date(), z.string()]),
      categories: z.union([z.array(z.string()), z.string()]).default([]),
      tags: z.union([z.array(z.string()), z.string()]).default([]),
      author: z.string().optional(),
    })
    .passthrough(), // banner: 등 yat 시절 필드는 무시하고 통과
});

export const collections = { posts };
