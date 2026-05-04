import type { InferSelectModel, InferInsertModel } from "drizzle-orm"
import { schema } from "@workspace/db"

export * from "./feed-ranking.ts"

export type User = InferSelectModel<typeof schema.users>
export type NewUser = InferInsertModel<typeof schema.users>

export type Post = InferSelectModel<typeof schema.posts>
export type NewPost = InferInsertModel<typeof schema.posts>

export type Media = InferSelectModel<typeof schema.media>
export type Article = InferSelectModel<typeof schema.articles>
export type Follow = InferSelectModel<typeof schema.follows>
export type Block = InferSelectModel<typeof schema.blocks>
export type Mute = InferSelectModel<typeof schema.mutes>
export type Like = InferSelectModel<typeof schema.likes>
export type Bookmark = InferSelectModel<typeof schema.bookmarks>
export type Hashtag = InferSelectModel<typeof schema.hashtags>
export type Notification = InferSelectModel<typeof schema.notifications>
export type Conversation = InferSelectModel<typeof schema.conversations>
export type Message = InferSelectModel<typeof schema.messages>
export type OAuthConnection = InferSelectModel<typeof schema.oauthConnections>
export type ApiKey = InferSelectModel<typeof schema.apiKeys>
export type Report = InferSelectModel<typeof schema.reports>
export type ModerationAction = InferSelectModel<typeof schema.moderationActions>

// Public-facing user DTO: strip sensitive fields.
export type PublicUser = Pick<
  User,
  | "id"
  | "handle"
  | "displayName"
  | "bio"
  | "location"
  | "websiteUrl"
  | "bannerUrl"
  | "avatarUrl"
  | "isVerified"
  | "isBot"
  | "createdAt"
>

export type SessionUser = PublicUser & { email: string; role: User["role"] }
