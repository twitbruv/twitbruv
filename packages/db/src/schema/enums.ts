import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['user', 'admin', 'owner'])

export const muteScopeEnum = pgEnum('mute_scope', ['feed', 'notifications', 'both'])

export const postVisibilityEnum = pgEnum('post_visibility', ['public', 'followers', 'unlisted'])
export const replyRestrictionEnum = pgEnum('reply_restriction', ['anyone', 'following', 'mentioned'])
export const mediaKindEnum = pgEnum('media_kind', ['image', 'video', 'gif'])
export const mediaStateEnum = pgEnum('media_state', ['pending', 'processing', 'ready', 'failed', 'flagged'])

export const articleFormatEnum = pgEnum('article_format', ['prosemirror', 'markdown', 'lexical'])
export const articleStatusEnum = pgEnum('article_status', ['draft', 'published', 'unlisted'])

export const conversationKindEnum = pgEnum('conversation_kind', ['dm', 'group'])
export const convRoleEnum = pgEnum('conv_role', ['member', 'admin'])
export const conversationRequestStateEnum = pgEnum('conversation_request_state', ['none', 'pending', 'accepted', 'declined'])
export const messageKindEnum = pgEnum('message_kind', ['text', 'media', 'post_share', 'article_share', 'system'])

export const notificationKindEnum = pgEnum('notification_kind', [
  'like',
  'repost',
  'reply',
  'mention',
  'follow',
  'dm',
  'article_reply',
  'quote',
])

export const apnsEnvironmentEnum = pgEnum('apns_environment', ['sandbox', 'production'])

export const oauthProviderEnum = pgEnum('oauth_provider', [
  'github',
  'gitlab',
  'bitbucket',
  'linear',
  'vercel',
  'figma',
  'discord',
])

export const eventKindEnum = pgEnum('event_kind', [
  'impression',
  'engagement',
  'profile_visit',
  'link_click',
  'follow',
  'unfollow',
  'article_read',
  'media_play',
])

export const reportReasonEnum = pgEnum('report_reason', [
  'spam',
  'harassment',
  'csam',
  'violence',
  'impersonation',
  'illegal',
  'other',
])

export const reportStatusEnum = pgEnum('report_status', ['open', 'triaged', 'actioned', 'dismissed'])
export const modActionEnum = pgEnum('mod_action', [
  'warn',
  'hide',
  'delete',
  'shadowban',
  'suspend',
  'unban',
  'nsfw_flag',
])
