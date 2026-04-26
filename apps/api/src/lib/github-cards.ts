import { and, asc, eq, inArray } from '@workspace/db'
import type { Database } from '@workspace/db'
import { schema } from '@workspace/db'
import { isGithubCardKind, type GithubCard } from '@workspace/github-unfurl'

/**
 * Batch-load GitHub cards keyed by post id, in render order. Only `state='ready'` rows
 * surface — `pending` and `failed` rows are simply omitted (no card shows up until the
 * worker has populated it). The set returned per post preserves the original URL order via
 * `post_url_unfurls.position`.
 */
export async function loadGithubCards(
  db: Database,
  postIds: Array<string>,
): Promise<Map<string, Array<GithubCard>>> {
  const map = new Map<string, Array<GithubCard>>()
  if (postIds.length === 0) return map

  const rows = await db
    .select({
      postId: schema.postUrlUnfurls.postId,
      position: schema.postUrlUnfurls.position,
      kind: schema.urlUnfurls.kind,
      card: schema.urlUnfurls.card,
    })
    .from(schema.postUrlUnfurls)
    .innerJoin(schema.urlUnfurls, eq(schema.urlUnfurls.id, schema.postUrlUnfurls.unfurlId))
    .where(
      and(
        inArray(schema.postUrlUnfurls.postId, postIds),
        eq(schema.urlUnfurls.state, 'ready'),
      ),
    )
    .orderBy(asc(schema.postUrlUnfurls.postId), asc(schema.postUrlUnfurls.position))

  for (const r of rows) {
    if (!isGithubCardKind(r.kind) || !r.card) continue
    const arr = map.get(r.postId) ?? []
    arr.push(r.card as GithubCard)
    map.set(r.postId, arr)
  }
  return map
}
