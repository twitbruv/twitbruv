/**
 * Tiered deterministic text policy for public posts (local layer before/at OpenAI moderation).
 *
 * Casual profanity not listed here passes through untouched. Block tier is severest-only;
 * ethnic / hate slurs that are not block-tier emit a moderator flag tier.
 */

/** Shown when block tier rejects a write (paired with HTTP 422 content_policy_blocked). */
export const CONTENT_POLICY_BLOCKED_MESSAGE =
  "This post can’t be published because it violates our content policy."

export type PostPlaintextAnalysis =
  | { action: "allow" }
  | { action: "flag"; reason: string }
  | { action: "block"; reason: string }

/** Hard-block: whole-word racial slurs (hard-R n-word variants) & CSAM-associated stems */
const BLOCK_WORD_REGEXES: ReadonlyArray<RegExp> = [
  /\bnigger\b/i,
  /\bniggers\b/i,
  /\bnigg3r\b/i,
  /\bn1gger\b/i,
  /\bni99er\b/i,
]

const BLOCK_SUBSTRINGS: ReadonlyArray<string> = ["pedophil", "necrophil"]

/** Flag for admin Review — hate / ethnic / antigay slurs; jew only as standalone token */
const FLAG_REGEXES: ReadonlyArray<RegExp> = [
  /\bjew\b/i,
  /\bkike\b/i,
  /\bspic\b/i,
  /\bchink\b/i,
  /\bwetback\b/i,
  /\bbeaner\b/i,
  /\bgook\b/i,
  /\bfaggot\b/i,
  /\bfag\b/i,
  /\bnigga\b/i,
  /\bcoon\b/i,
  /\bcracker\b/i,
  /\bretard\b/i,
  /\bretarded\b/i,
  /\btranny\b/i,
  /\btwats?\b/i,
]

function concatParts(parts: ReadonlyArray<string>): string {
  return parts.map((s) => s.trim()).join("\u0001")
}

/** Scan combined post body + poll lines (joined with a sentinel). */
export function analyzePostPlaintext(textParts: ReadonlyArray<string>): PostPlaintextAnalysis {
  const blob = concatParts(textParts).toLowerCase()

  if (blob.length === 0) return { action: "allow" }

  for (const re of BLOCK_WORD_REGEXES) {
    re.lastIndex = 0
    if (re.test(blob)) return { action: "block", reason: "severe_slur_word" }
  }
  for (const s of BLOCK_SUBSTRINGS) {
    if (blob.includes(s)) return { action: "block", reason: "major_policy_stem" }
  }

  for (const re of FLAG_REGEXES) {
    re.lastIndex = 0
    if (re.test(blob)) return { action: "flag", reason: "policy_slur_or_hate" }
  }

  return { action: "allow" }
}
