import OpenAI from "openai"
import type { Env } from "./env.ts"
import type { Logger } from "./logger.ts"

export type ModerationVerdict =
  | { verdict: "clean" }
  | { verdict: "block"; categories: string[]; message: string }

export type Moderator = (
  text: string,
  imageUrls?: ReadonlyArray<string>
) => Promise<ModerationVerdict>

const REQUEST_TIMEOUT_MS = 5000

// After a moderation request fails (timeout / network / 5xx), bypass the moderation API
// entirely for this long so subsequent post submissions don't each pay the timeout. Per-worker
// state — multi-process deployments will have one breaker per worker, which is fine: the
// first request after cooldown probes whether OpenAI is back, the rest ride free.
const CIRCUIT_OPEN_MS = 30_000

// Per-category score thresholds (0–1). Lower = stricter. Tuned for "block hateful or harmful
// content even when the model isn't fully sure" — hate categories are aggressive (model
// underscores phrases like 'heil hitler'), violence/sexual are looser (false positives common
// for everyday phrasing). Adjust here when calibrating false-positive rate.
const CATEGORY_THRESHOLDS: Record<string, number> = {
  hate: 0.3,
  "hate/threatening": 0.3,
  harassment: 0.5,
  "harassment/threatening": 0.3,
  violence: 0.8,
  "violence/graphic": 0.7,
  "self-harm": 0.5,
  "self-harm/intent": 0.4,
  "self-harm/instructions": 0.4,
  sexual: 0.8,
  "sexual/minors": 0.1,
  illicit: 0.6,
  "illicit/violent": 0.5,
}

const BLOCKED_MESSAGE =
  "This post may violate community guidelines and was not published."

type ModerationInput =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >

export function createModerator(env: Env, log: Logger): Moderator {
  const modLog = log.child({ scope: "moderation" })

  if (!env.OPENAI_API_KEY) {
    modLog.warn(
      "moderation_disabled: OPENAI_API_KEY not set; all posts will pass"
    )
    return async () => ({ verdict: "clean" })
  }

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: REQUEST_TIMEOUT_MS,
  })

  let circuitOpenUntil = 0

  return async function moderate(
    text: string,
    imageUrls: ReadonlyArray<string> = []
  ): Promise<ModerationVerdict> {
    const trimmed = text.trim()
    if (trimmed.length === 0 && imageUrls.length === 0) {
      return { verdict: "clean" }
    }

    if (Date.now() < circuitOpenUntil) {
      return { verdict: "clean" }
    }

    let input: ModerationInput
    if (imageUrls.length === 0) {
      input = trimmed
    } else {
      const parts: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      > = []
      if (trimmed.length > 0) parts.push({ type: "text", text: trimmed })
      for (const url of imageUrls) {
        parts.push({ type: "image_url", image_url: { url } })
      }
      input = parts
    }

    try {
      const response = await client.moderations.create({
        model: "omni-moderation-latest",
        input: input as never,
      })

      // Multimodal requests come back with one result per input part; check them all.
      for (const result of response.results) {
        const offending = Object.entries(CATEGORY_THRESHOLDS).filter(
          ([cat, threshold]) =>
            (result.category_scores[cat as keyof typeof result.category_scores] ?? 0) >
            threshold
        )

        if (result.flagged || offending.length > 0) {
          const flaggedFromOpenAI = Object.entries(result.categories)
            .filter(([, hit]) => hit === true)
            .map(([name]) => name)
          const categories = Array.from(
            new Set([
              ...flaggedFromOpenAI,
              ...offending.map(([name]) => name),
            ])
          )
          return { verdict: "block", categories, message: BLOCKED_MESSAGE }
        }
      }

      return { verdict: "clean" }
    } catch (err) {
      circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS
      modLog.warn(
        { err, circuitOpenForMs: CIRCUIT_OPEN_MS },
        "moderation_failed_open"
      )
      return { verdict: "clean" }
    }
  }
}
