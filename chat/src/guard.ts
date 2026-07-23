/**
 * Code-level input guard — runs BEFORE any paid API call (embedding or chat).
 * This is deliberately separate from the system prompt's own off-topic
 * refusal: the system prompt is a *request* the model can choose to follow
 * (and a determined jailbreak can bypass it), and by the time the model
 * decides to refuse, the embedding + chat calls have already been paid for.
 * A code-level regex filter is free to run and unbypassable-by-persuasion —
 * it either matches or it doesn't.
 *
 * This is intentionally pattern-based and imperfect (see README) — it
 * catches known, common attack shapes cheaply. It is not a substitute for
 * the system prompt's instructions, which still matter as a second layer
 * for anything that slips past this filter.
 */

export interface GuardResult {
  blocked: boolean;
  category?: 'jailbreak' | 'ooc-injection' | 'prompt-extraction' | 'secret-fishing' | 'obfuscation';
}

// Zero-width / invisible characters have no legitimate reason to appear in a
// human-typed question — their presence alone is a strong obfuscation signal
// (e.g. splitting a blocked keyword with U+200B so a naive filter misses it).
const INVISIBLE_CHARS_RE = /[​-‍﻿­⁠]/;

// Long unbroken base64/hex-looking runs — legitimate Korean blog questions
// don't contain 40+ char blobs like this; used to smuggle encoded instructions.
const BASE64_BLOB_RE = /[A-Za-z0-9+/]{40,}={0,2}/;
const HEX_BLOB_RE = /(?:[0-9a-fA-F]{2}){20,}/;

// English gets full coverage (the most common second attack language by far).
// Beyond Korean/English we don't chase exhaustive per-language regex — that's
// a maintenance sinkhole with diminishing returns. Instead: (a) the OOC/
// structural patterns below are markup, not natural language, so they catch
// attacks regardless of language; (b) the system prompt's own semantic
// refusal (SYSTEM_PROMPT in prompt.ts) understands intent in any language,
// as a second layer for whatever slips past this filter; (c) we still cover
// the single most copy-pasted "universal jailbreak" line in a few more
// languages, since that exact template circulates verbatim across attackers
// regardless of their own language.
const JAILBREAK_PATTERNS: RegExp[] = [
  // Korean
  /이전\s*(지시|명령|규칙).{0,10}(무시|잊)/,
  /위\s*(지시|명령|규칙).{0,10}(무시|잊)/,
  /제약\s*(없이|풀고|해제)/,
  /규칙\s*(무시|없이|풀고)/,
  /제약\s*없는\s*(모드|상태)로/,
  /너는\s*이제부터/,
  /지금부터\s*너는/,
  // English
  /DAN\s*mode/i,
  /developer\s*mode/i,
  /god\s*mode/i,
  /jailbreak(en|ing)?/i,
  /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|rules)/i,
  /forget\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|rules)/i,
  /without\s+any\s+(rules|restrictions|limits|filters)/i,
  /no\s+(rules|restrictions|limits|filters|censorship)/i,
  /unrestricted\s+(mode|ai|assistant)/i,
  /you\s+are\s+now\s+(free|unrestricted|unfiltered)/i,
  /from\s+now\s+on,?\s+you\s+(are|will|must)/i,
  /act\s+as\s+(if\s+you|an?)\s/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /roleplay\s+as/i,
  // Highest-frequency copy-pasted jailbreak template, other languages
  /以前の指示.{0,6}無視/, // Japanese
  /忽略.{0,6}(之前|上面).{0,6}(指令|指示)/, // Chinese
  /ignora\s+(las\s+)?instrucciones\s+(anteriores|previas)/i, // Spanish
  /ignore[zr]\s+les\s+instructions\s+précédentes/i, // French
];

const OOC_PATTERNS: RegExp[] = [
  /\(?\s*OOC\s*[:)]/i,
  /\[\s*OOC\s*\]/i,
  /\[\s*SYSTEM\s*\]/i,
  /\[\s*INST\s*\]/i,
  /<<\s*(SYS|system|지시사항)\s*>>/i,
  /<\|[a-z_]+\|>/i, // special-token-style injection, e.g. <|im_start|>system
  /###\s*(system|instruction|지시)/i,
  /\{\{\s*system\s*\}\}/i,
];

const PROMPT_EXTRACTION_PATTERNS: RegExp[] = [
  /시스템\s*프롬프트/,
  /system\s*prompt/i,
  /네\s*지시사항/,
  /너(한테|에게)\s*내려진\s*지시/,
  /위에\s*뭐라고\s*(써|적혀)/,
  /지금까지\s*(받은|입력된|주어진)\s*지시/,
  /repeat\s+the\s+(words|text|instructions?)\s+above/i,
  /print\s+your\s+(instructions?|prompt)/i,
  /reveal\s+your\s+(prompt|instructions?)/i,
  /show\s+me\s+your\s+(prompt|instructions?)/i,
  /what\s+(were\s+you\s+told|are\s+your\s+instructions?|is\s+your\s+prompt)/i,
  /output\s+(the\s+)?(text|prompt|instructions?)\s+above/i,
  /repeat\s+everything\s+(above|before)\s+this/i,
];

// Scoped narrowly to secrets/credentials — NOT general contact info, since
// the public email is already on the About page and is a legitimate answer.
const SECRET_FISHING_PATTERNS: RegExp[] = [
  /api\s*키/i,
  /api\s*key/i,
  /비밀\s*번호/,
  /password/i,
  /passphrase/i,
  /결제\s*(정보|수단)/,
  /신용\s*카드/,
  /계좌\s*번호/,
  /credit\s*card/i,
  /bank\s*account/i,
  /credential/i,
  /secret\s*key/i,
  /access\s*token/i,
];

function stripInvisibleChars(text: string): string {
  return text.replace(INVISIBLE_CHARS_RE, '');
}

export function checkAbusePatterns(rawQuestion: string): GuardResult {
  // Presence of invisible chars is itself the signal — block outright rather
  // than silently cleaning and continuing (no legitimate use case for them).
  if (INVISIBLE_CHARS_RE.test(rawQuestion)) {
    return { blocked: true, category: 'obfuscation' };
  }

  // NFKC folds many unicode look-alike/compatibility variants into a common
  // form before pattern matching, so simple visual substitutions don't evade
  // the regexes below.
  const normalized = stripInvisibleChars(rawQuestion).normalize('NFKC');

  if (BASE64_BLOB_RE.test(normalized) || HEX_BLOB_RE.test(normalized)) {
    return { blocked: true, category: 'obfuscation' };
  }
  if (OOC_PATTERNS.some((re) => re.test(normalized))) {
    return { blocked: true, category: 'ooc-injection' };
  }
  if (JAILBREAK_PATTERNS.some((re) => re.test(normalized))) {
    return { blocked: true, category: 'jailbreak' };
  }
  if (PROMPT_EXTRACTION_PATTERNS.some((re) => re.test(normalized))) {
    return { blocked: true, category: 'prompt-extraction' };
  }
  if (SECRET_FISHING_PATTERNS.some((re) => re.test(normalized))) {
    return { blocked: true, category: 'secret-fishing' };
  }

  return { blocked: false };
}
