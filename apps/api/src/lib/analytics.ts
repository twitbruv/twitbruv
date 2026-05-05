import { Databuddy } from '@databuddy/sdk/node'
import type { Logger } from './logger.ts'

export type EventName =
  | 'post_created'
  | 'post_deleted'
  | 'post_edited'
  | 'post_liked'
  | 'post_unliked'
  | 'post_reposted'
  | 'post_unreposted'
  | 'post_bookmarked'
  | 'post_unbookmarked'
  | 'post_pinned'
  | 'post_unpinned'
  | 'post_hidden'
  | 'post_unhidden'
  | 'user_followed'
  | 'user_unfollowed'
  | 'user_blocked'
  | 'user_unblocked'
  | 'user_muted'
  | 'user_unmuted'
  | 'handle_claimed'
  | 'profile_updated'
  | 'dm_sent'
  | 'dm_started'
  | 'dm_group_created'
  | 'dm_message_edited'
  | 'dm_message_deleted'
  | 'dm_reaction_toggled'
  | 'dm_members_added'
  | 'dm_member_removed'
  | 'article_created'
  | 'article_updated'
  | 'article_deleted'
  | 'scheduled_post_published'
  | 'list_created'
  | 'list_deleted'
  | 'list_members_added'
  | 'list_member_removed'
  | 'poll_voted'
  | 'search_saved'
  | 'search_saved_deleted'
  | 'chess_game_created'
  | 'content_reported'
  | 'admin_user_banned'
  | 'admin_user_unbanned'
  | 'admin_user_shadowbanned'
  | 'admin_user_unshadowbanned'
  | 'admin_user_verified'
  | 'admin_user_unverified'
  | 'admin_user_contributor_granted'
  | 'admin_user_contributor_revoked'
  | 'admin_user_role_set'
  | 'admin_user_handle_set'
  | 'admin_user_deleted'
  | 'admin_report_resolved'
  | 'admin_post_deleted'

export interface TrackingIds {
  anonymousId?: string | null
  sessionId?: string | null
}

export interface TrackFn {
  (name: EventName, userId: string, properties?: Record<string, unknown>, ids?: TrackingIds): void
}

/**
 * Creates a fire-and-forget track function. If no API key is provided,
 * returns a no-op so the app runs fine without analytics configured.
 */
export function createTracker(apiKey: string | undefined, websiteId: string | undefined, log: Logger): TrackFn {
  if (!apiKey) {
    return () => {}
  }

  const client = new Databuddy({
    apiKey,
    websiteId,
    source: 'api',
    enableBatching: true,
    batchSize: 25,
    batchTimeout: 5000,
  })

  return (name, userId, properties, ids) => {
    client.track({
      name,
      properties: { ...properties, user_id: userId },
      anonymousId: ids?.anonymousId,
      sessionId: ids?.sessionId,
    }).catch((err) => {
      log.warn({ err: err instanceof Error ? err.message : err, event: name }, 'analytics_track_failed')
    })
  }
}
