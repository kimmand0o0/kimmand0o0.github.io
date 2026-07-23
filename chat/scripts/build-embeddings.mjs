#!/usr/bin/env node
// Builds chat/data/embeddings.json from the *built* site (gh-pages branch),
// not the raw markdown in _posts/. This guarantees the URLs and text we
// embed exactly match what's actually live — Jekyll's permalink algorithm
// (categories → lowercased path segments, Korean-safe percent-encoding) is
// non-trivial to reimplement correctly, so we let Jekyll do it once and read
// the result instead of guessing.
//
// Usage:
//   OPENAI_API_KEY=sk-... node scripts/build-embeddings.mjs
//   node --env-file=.env scripts/build-embeddings.mjs   (Node 20.6+)

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as cheerio from 'cheerio';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUTPUT_PATH = path.resolve(import.meta.dirname, '..', 'data', 'embeddings.json');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 512;
const MAX_CHUNK_CHARS = 1000;
const EMBED_BATCH_SIZE = 20;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set. Export it or use `node --env-file=.env ...`.');
  process.exit(1);
}

// Post pages live at .../YYYY/MM/DD/slug.html — this pattern excludes
// non-post pages (about.html, tags.html, archives.html, index.html, etc.).
const POST_PATH_RE = /\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/;

function exportGhPages() {
  // IMPORTANT: `git fetch origin master` (or any single-ref fetch) does NOT
  // update the local origin/gh-pages ref — it can silently go stale for the
  // lifetime of a session/clone while gh-pages keeps deploying upstream,
  // causing this script to embed an old snapshot of the site (missing
  // recently-published posts) with no error or warning. Always fetch the
  // branch explicitly right before reading it.
  console.log('Fetching latest gh-pages...');
  execSync('git fetch origin gh-pages', { cwd: REPO_ROOT, stdio: 'inherit' });

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'ghpages-'));
  execSync(`git archive origin/gh-pages | tar -x -C "${tmpDir}"`, { cwd: REPO_ROOT, stdio: 'inherit' });
  return tmpDir;
}

async function findPostHtmlFiles(dir) {
  const results = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.html') && POST_PATH_RE.test(full)) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

function extractPost(filePath) {
  const html = readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);

  const canonicalUrl = $('link[rel="canonical"]').first().attr('href');
  const title = $('meta[property="og:title"]').first().attr('content') ?? $('title').text().split('|')[0].trim();
  // Strip <script>/<style> before extracting text — cheerio's .text() walks
  // all descendant text nodes including inside these (unlike a browser,
  // which never renders them), so raw CSS/JS otherwise leaks into the
  // embedded content. Bit us on about.html, which has an inline <style>
  // block for the stat-highlight class.
  const $content = $('.post-content').first();
  $content.find('script, style').remove();
  const bodyText = $content.text().replace(/\s+/g, ' ').trim();

  return { title, url: canonicalUrl, bodyText };
}

/** Greedy paragraph packing — avoids cutting mid-sentence where possible. */
function chunkText(text, maxChars) {
  const paragraphs = text
    .split(/(?<=[.!?다요]\s)|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if ((current + ' ' + p).length > maxChars && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? `${current} ${p}` : p;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function embedBatch(texts, attempt = 1) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
  });

  if (res.status === 429 && attempt <= 5) {
    // Tokens-per-minute limit — back off and retry rather than aborting the
    // whole run. Exponential backoff since the API doesn't always return a
    // reliable Retry-After for TPM (vs RPM) limits.
    const delayMs = attempt * 2000;
    console.warn(`  rate limited, retrying in ${delayMs}ms (attempt ${attempt}/5)...`);
    await sleep(delayMs);
    return embedBatch(texts, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`embeddings API error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// Non-post pages worth indexing too — currently just About (who Haeran is,
// contact, skills, work experience). Same .post-content structure as posts,
// so extractPost() works unchanged; these just don't match POST_PATH_RE.
const EXTRA_PAGES = ['about.html'];

async function main() {
  console.log('Exporting gh-pages branch...');
  const tmpDir = exportGhPages();

  try {
    const htmlFiles = await findPostHtmlFiles(tmpDir);
    for (const extra of EXTRA_PAGES) {
      const full = path.join(tmpDir, extra);
      if (existsSync(full)) htmlFiles.push(full);
      else console.warn(`  extra page not found, skipping: ${extra}`);
    }
    console.log(`Found ${htmlFiles.length} pages (posts + extras).`);

    const pending = [];
    for (const file of htmlFiles) {
      const { title, url, bodyText } = extractPost(file);
      if (!url || !bodyText) {
        console.warn(`  skip (no url/body): ${file}`);
        continue;
      }
      const chunks = chunkText(bodyText, MAX_CHUNK_CHARS);
      chunks.forEach((chunk, i) => {
        pending.push({ id: `${url}#${i}`, title, url, chunk });
      });
    }
    console.log(`Chunked into ${pending.length} pieces. Embedding in batches of ${EMBED_BATCH_SIZE}...`);

    const results = [];
    for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
      const batch = pending.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await embedBatch(batch.map((b) => b.chunk));
      batch.forEach((b, j) => results.push({ ...b, vector: vectors[j] }));
      console.log(`  embedded ${Math.min(i + EMBED_BATCH_SIZE, pending.length)}/${pending.length}`);
      await sleep(500); // stay comfortably under the embeddings TPM limit
    }

    const output = {
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      generatedAt: new Date().toISOString(),
      chunks: results,
    };
    writeFileSync(OUTPUT_PATH, JSON.stringify(output));
    console.log(`Wrote ${OUTPUT_PATH} (${results.length} chunks, ${(JSON.stringify(output).length / 1024).toFixed(0)} KB)`);
    console.log('Next: npm run upload-embeddings');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
