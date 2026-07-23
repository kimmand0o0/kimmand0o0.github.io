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

const JAILBREAK_PATTERNS: RegExp[] = [
  /이전\s*(지시|명령|규칙).{0,10}(무시|잊)/,
  /위\s*(지시|명령|규칙).{0,10}(무시|잊)/,
  /제약\s*(없이|풀고|해제)/,
  /규칙\s*(무시|없이|풀고)/,
  /DAN\s*모드/i,
  /jailbreak/i,
  /ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+instructions?/i,
  /disregard\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions?|rules)/i,
  /without\s+any\s+(rules|restrictions|limits|filters)/i,
  /제약\s*없는\s*(모드|상태)로/,
  /너는\s*이제부터/,
  /act\s+as\s+(if\s+you|an?)\s/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /roleplay\s+as/i,
];

const OOC_PATTERNS: RegExp[] = [
  /\(?\s*OOC\s*[:)]/i,
  /\[\s*OOC\s*\]/i,
  /\[\s*SYSTEM\s*\]/i,
  /<<\s*(system|지시사항)\s*>>/i,
  /###\s*(system|지시)/i,
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
  /what\s+(were\s+you\s+told|are\s+your\s+instructions?)/i,
];

// Scoped narrowly to secrets/credentials — NOT general contact info, since
// the public email is already on the About page and is a legitimate answer.
const SECRET_FISHING_PATTERNS: RegExp[] = [
  /api\s*키/i,
  /api\s*key/i,
  /비밀\s*번호/,
  /password/i,
  /결제\s*(정보|수단)/,
  /신용\s*카드/,
  /계좌\s*번호/,
  /credential/i,
  /secret\s*key/i,
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
