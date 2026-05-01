import { sql, inArray } from 'drizzle-orm'

import * as schema from './schema/index.ts'

const HASHTAG_RE = /#([a-z0-9_]+)/gi

export function extractHashtags(text: string): Array<string> {
  const tags = new Set<string>()
  for (const m of text.matchAll(HASHTAG_RE)) {
    tags.add(m[1]!.toLowerCase())
  }
  return Array.from(tags).slice(0, 10) // cap at 10 per post
}

/** tx is a drizzle transaction / db — typed loosely because Drizzle's tx type is verbose. */
export async function linkHashtags(tx: any, postId: string, text: string) {
  const tags = extractHashtags(text)
  if (tags.length === 0) return

  const rows = await tx
    .insert(schema.hashtags)
    .values(tags.map((tag) => ({ tag })))
    .onConflictDoUpdate({ target: schema.hashtags.tag, set: { tag: sql`excluded.tag` } })
    .returning({ id: schema.hashtags.id, tag: schema.hashtags.tag })

  if (rows.length === 0) return

  await tx
    .insert(schema.postHashtags)
    .values(rows.map((r: { id: number }) => ({ postId, hashtagId: r.id })))
    .onConflictDoNothing()
}

const MENTION_RE = /(?<![\w@])@([a-z0-9_]{3,20})/gi

/** Extract unique @handles (without the @, lowercased). Capped at 20. */
export function extractMentions(text: string): Array<string> {
  const found = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) {
    found.add(m[1]!.toLowerCase())
  }
  return Array.from(found).slice(0, 20)
}

/**
 * Resolve @handles to user ids within a transaction and write mentions rows.
 * Returns the list of mentioned user ids (excluding the author).
 */
export async function linkMentions(
  tx: any,
  postId: string,
  authorId: string,
  text: string,
): Promise<Array<string>> {
  const handles = extractMentions(text)
  if (handles.length === 0) return []

  const users = await tx
    .select({ id: schema.users.id, handle: schema.users.handle })
    .from(schema.users)
    .where(inArray(schema.users.handle, handles))

  const mentionedIds = users
    .map((u: { id: string; handle: string | null }) => u.id)
    .filter((id: string) => id !== authorId)

  if (mentionedIds.length > 0) {
    await tx
      .insert(schema.mentions)
      .values(mentionedIds.map((mentionedUserId: string) => ({ postId, mentionedUserId })))
      .onConflictDoNothing()
  }
  return mentionedIds
}
