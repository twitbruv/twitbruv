import { and, eq } from '@workspace/db'
import { schema } from '@workspace/db'
import type { AppContext } from './context.ts'
import { decryptToken } from './connector-crypto.ts'
import {
  fetchViewerProfile,
  GitHubAuthError,
  type ContributionCalendar,
  type PinnedRepo,
} from './github-client.ts'

export interface GithubSnapshot {
  login: string
  name: string | null
  avatarUrl: string
  htmlUrl: string
  followers: number
  following: number
  publicRepos: number
  contributions: ContributionCalendar
  pinned: Array<PinnedRepo>
  refreshedAt: string
  stale?: boolean
}

export interface StoredMetadata extends GithubSnapshot {
  failedAt?: string
  failureReason?: string
}

const CACHE_TTL_SEC = 60 * 60 // 1h fresh window
const LOCK_TTL_SEC = 30 // single-flight guard

function cacheKey(userId: string) {
  return `gh:profile:${userId}`
}
function lockKey(userId: string) {
  return `gh:profile:${userId}:lock`
}

interface ConnectionRow {
  id: string
  userId: string
  accessTokenEncrypted: string | null
  metadata: unknown
  showOnProfile: boolean
}

async function loadConnection(ctx: AppContext, userId: string): Promise<ConnectionRow | null> {
  const [row] = await ctx.db
    .select({
      id: schema.oauthConnections.id,
      userId: schema.oauthConnections.userId,
      accessTokenEncrypted: schema.oauthConnections.accessTokenEncrypted,
      metadata: schema.oauthConnections.metadata,
      showOnProfile: schema.oauthConnections.showOnProfile,
    })
    .from(schema.oauthConnections)
    .where(
      and(
        eq(schema.oauthConnections.userId, userId),
        eq(schema.oauthConnections.provider, 'github'),
      ),
    )
    .limit(1)
  return row ?? null
}

function isFresh(meta: StoredMetadata | null | undefined): boolean {
  if (!meta?.refreshedAt) return false
  const age = Date.now() - new Date(meta.refreshedAt).getTime()
  return age < CACHE_TTL_SEC * 1000
}

/**
 * Fetches the GitHub snapshot for a user. Multi-tier cache:
 *  1. Redis (1h TTL) — hot path for profile views
 *  2. oauth_connections.metadata — survives a Redis flush, also acts as fallback if GitHub
 *     errors during a refresh
 *  3. GitHub GraphQL — cold fetch
 *
 * Stampede guard: a `SETNX` lock per user means only one request triggers a cold fetch when
 * many viewers hit a popular profile at the same time. The losers fall through to the
 * stored snapshot (which they read from the DB row, no further GitHub call).
 */
export async function getGithubSnapshot(
  ctx: AppContext,
  userId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<{ snapshot: GithubSnapshot | null; showOnProfile: boolean }> {
  const conn = await loadConnection(ctx, userId)
  if (!conn) return { snapshot: null, showOnProfile: false }

  if (!opts.forceRefresh) {
    const cached = await ctx.cache.get<GithubSnapshot>(cacheKey(userId))
    if (cached) return { snapshot: cached, showOnProfile: conn.showOnProfile }
  }

  const stored = (conn.metadata as StoredMetadata | null) ?? null
  if (!opts.forceRefresh && isFresh(stored)) {
    // DB had a fresh snapshot but Redis didn't (eviction, restart). Repopulate Redis.
    await ctx.cache.set(cacheKey(userId), stored!, CACHE_TTL_SEC)
    return { snapshot: stored!, showOnProfile: conn.showOnProfile }
  }

  // Cold path: try to acquire the lock; if we lose, fall back to stored snapshot.
  const acquired = await ctx.cache.redis.set(lockKey(userId), '1', 'EX', LOCK_TTL_SEC, 'NX')
  if (!acquired && !opts.forceRefresh) {
    if (stored) {
      return {
        snapshot: { ...stored, stale: true },
        showOnProfile: conn.showOnProfile,
      }
    }
    return { snapshot: null, showOnProfile: conn.showOnProfile }
  }

  try {
    if (!conn.accessTokenEncrypted) {
      throw new GitHubAuthError('no_token')
    }
    const token = decryptToken(conn.accessTokenEncrypted)
    const fetched = await fetchViewerProfile(token)
    const snapshot: GithubSnapshot = {
      login: fetched.login,
      name: fetched.name,
      avatarUrl: fetched.avatarUrl,
      htmlUrl: fetched.htmlUrl,
      followers: fetched.followers,
      following: fetched.following,
      publicRepos: fetched.publicRepos,
      contributions: fetched.contributions,
      pinned: fetched.pinned,
      refreshedAt: new Date().toISOString(),
    }
    await persistSnapshot(ctx, conn.id, userId, snapshot, fetched.pinned)
    await ctx.cache.set(cacheKey(userId), snapshot, CACHE_TTL_SEC)
    return { snapshot, showOnProfile: conn.showOnProfile }
  } catch (err) {
    if (err instanceof GitHubAuthError) {
      // Token revoked/expired — clear it so the UI surfaces a reconnect CTA. Snapshot stays
      // for now so the profile doesn't blank out.
      await ctx.db
        .update(schema.oauthConnections)
        .set({
          accessTokenEncrypted: null,
          updatedAt: new Date(),
          metadata: stored
            ? ({ ...stored, failedAt: new Date().toISOString(), failureReason: 'unauthorized' } as StoredMetadata)
            : ({ failedAt: new Date().toISOString(), failureReason: 'unauthorized' } as Partial<StoredMetadata>),
        })
        .where(eq(schema.oauthConnections.id, conn.id))
      ctx.log.warn({ userId }, 'github_connector_token_revoked')
    } else {
      ctx.log.error(
        { err: err instanceof Error ? err.message : err, userId },
        'github_snapshot_refresh_failed',
      )
      // Persist the failure marker so callers can surface "last refresh failed".
      if (stored) {
        await ctx.db
          .update(schema.oauthConnections)
          .set({
            updatedAt: new Date(),
            metadata: { ...stored, failedAt: new Date().toISOString(), failureReason: 'fetch_failed' } as StoredMetadata,
          })
          .where(eq(schema.oauthConnections.id, conn.id))
      }
    }
    if (stored) {
      return { snapshot: { ...stored, stale: true }, showOnProfile: conn.showOnProfile }
    }
    return { snapshot: null, showOnProfile: conn.showOnProfile }
  } finally {
    // Best-effort lock release — short TTL means a leak self-heals in 30s anyway.
    await ctx.cache.redis.del(lockKey(userId)).catch(() => {})
  }
}

async function persistSnapshot(
  ctx: AppContext,
  connectionId: string,
  userId: string,
  snapshot: GithubSnapshot,
  pinned: Array<PinnedRepo>,
): Promise<void> {
  await ctx.db
    .update(schema.oauthConnections)
    .set({
      providerUsername: snapshot.login,
      metadata: snapshot,
      updatedAt: new Date(),
    })
    .where(eq(schema.oauthConnections.id, connectionId))

  // Replace the pinned-items denormalization. Tiny set (≤6) so a wipe-and-insert is fine.
  await ctx.db
    .delete(schema.pinnedConnectorItems)
    .where(
      and(
        eq(schema.pinnedConnectorItems.userId, userId),
        eq(schema.pinnedConnectorItems.provider, 'github'),
      ),
    )
  if (pinned.length > 0) {
    const now = new Date()
    await ctx.db.insert(schema.pinnedConnectorItems).values(
      pinned.map((p, i) => ({
        userId,
        provider: 'github' as const,
        itemType: 'repository',
        itemId: p.id,
        snapshot: p,
        position: i,
        refreshedAt: now,
      })),
    )
  }
}

export async function bustCache(ctx: AppContext, userId: string): Promise<void> {
  await ctx.cache.del(cacheKey(userId))
}
