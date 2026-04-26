# Analytics Server-Side Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all mutation event tracking from the frontend (`trackedAction()`) to server-side (`@databuddy/sdk/node`) in the API, simplify the frontend analytics layer, and add devtools for dev visibility.

**Architecture:** The API already processes every mutation — it's the source of truth. We add a `Databuddy` node client to `AppContext`, expose a `ctx.track()` helper, and call it from route handlers after successful mutations. The frontend drops all `trackedAction()` calls, keeps only client-side concerns (impressions, `<Databuddy>` component with more props enabled), and gains `@databuddy/devtools` for development.

**Tech Stack:** `@databuddy/sdk` (node entry point), `@databuddy/devtools` (React), Hono, Bun

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `apps/api/src/lib/analytics.ts` | Thin wrapper: inits `Databuddy` node client, exports typed `track()` helper |
| Modify | `apps/api/src/lib/env.ts` | Add `DATABUDDY_API_KEY` to env schema |
| Modify | `apps/api/src/lib/context.ts` | Add analytics client to `AppContext` |
| Modify | `apps/api/src/routes/posts.ts` | Add `ctx.track()` calls after post mutations |
| Modify | `apps/api/src/routes/users.ts` | Add `ctx.track()` calls after follow/block/mute |
| Modify | `apps/api/src/routes/me.ts` | Add `ctx.track()` calls after profile update, handle claim |
| Modify | `apps/api/src/routes/dms.ts` | Add `ctx.track()` calls after DM mutations |
| Modify | `apps/api/src/routes/admin.ts` | Add `ctx.track()` calls after admin actions |
| Modify | `apps/api/src/routes/articles.ts` | Add `ctx.track()` calls after article CRUD |
| Modify | `apps/api/src/routes/lists.ts` | Add `ctx.track()` calls after list mutations |
| Modify | `apps/api/src/routes/polls.ts` | Add `ctx.track()` call after poll vote |
| Modify | `apps/api/src/routes/reports.ts` | Add `ctx.track()` call after report creation |
| Modify | `apps/api/src/routes/search.ts` | Add `ctx.track()` calls after saved search mutations |
| Modify | `apps/api/src/routes/scheduled-posts.ts` | Add `ctx.track()` call after publish |
| Modify | `apps/api/src/routes/chess.ts` | Add `ctx.track()` call after game creation |
| Modify | `apps/web/src/lib/analytics.ts` | Remove `trackedAction`, remove `EventName` type, keep `recordImpression` and `track` re-export |
| Modify | `apps/web/src/routes/__root.tsx` | Add devtools, add more `<Databuddy>` props |
| Modify | 20 frontend component/route files | Replace `trackedAction(name, fn)` with plain `fn()` |
| Modify | `apps/web/package.json` | Add `@databuddy/devtools` dev dependency |
| Modify | `apps/api/package.json` | Add `@databuddy/sdk` dependency |
| Modify | `.env.example` | Add `DATABUDDY_API_KEY` |

---

### Task 1: Add `@databuddy/sdk` to the API and `@databuddy/devtools` to the web app

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /private/tmp/twitbruv && bun add --cwd apps/api @databuddy/sdk
cd /private/tmp/twitbruv && bun add --cwd apps/web -d @databuddy/devtools
```

- [ ] **Step 2: Verify both packages resolve**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api -e "import('@databuddy/sdk/node').then(() => console.log('ok'))"
cd /private/tmp/twitbruv && bun run --cwd apps/web -e "import('@databuddy/devtools/react').then(() => console.log('ok'))"
```

Expected: Both print `ok`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/web/package.json bun.lock
git commit -m "deps: add @databuddy/sdk to API, @databuddy/devtools to web"
```

---

### Task 2: Add `DATABUDDY_API_KEY` to the API env schema

**Files:**
- Modify: `apps/api/src/lib/env.ts:21-110`
- Modify: `.env.example`

- [ ] **Step 1: Add env var to the zod schema**

In `apps/api/src/lib/env.ts`, add to the `envSchema` object (after the `ENABLE_HSTS` field, before the closing `}`):

```typescript
  // Databuddy server-side analytics API key (format: dbdy_xxx). Optional — if unset,
  // server-side event tracking is silently disabled.
  DATABUDDY_API_KEY: z.string().optional(),
```

- [ ] **Step 2: Add to `.env.example`**

After the existing `VITE_PUBLIC_DATABUDDY_CLIENT_ID=` line, add:

```
# Databuddy server-side API key (from https://app.databuddy.cc, format: dbdy_xxx). Leave blank to disable.
DATABUDDY_API_KEY=
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/env.ts .env.example
git commit -m "config: add DATABUDDY_API_KEY env var for server-side analytics"
```

---

### Task 3: Create the server-side analytics module and wire into AppContext

**Files:**
- Create: `apps/api/src/lib/analytics.ts`
- Modify: `apps/api/src/lib/context.ts:1-99`

- [ ] **Step 1: Create `apps/api/src/lib/analytics.ts`**

```typescript
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
  | 'admin_user_role_set'
  | 'admin_user_handle_set'
  | 'admin_user_deleted'
  | 'admin_report_resolved'
  | 'admin_post_deleted'

export interface TrackFn {
  (name: EventName, userId: string, properties?: Record<string, unknown>): void
}

/**
 * Creates a fire-and-forget track function. If no API key is provided,
 * returns a no-op so the app runs fine without analytics configured.
 */
export function createTracker(apiKey: string | undefined, log: Logger): TrackFn {
  if (!apiKey) {
    return () => {}
  }

  const client = new Databuddy({
    apiKey,
    source: 'api',
    enableBatching: true,
    batchSize: 25,
    batchTimeout: 5000,
  })

  return (name, userId, properties) => {
    client.track({ name, properties: { ...properties, user_id: userId } }).catch((err) => {
      log.warn({ err: err instanceof Error ? err.message : err, event: name }, 'analytics_track_failed')
    })
  }
}
```

- [ ] **Step 2: Wire into `AppContext`**

In `apps/api/src/lib/context.ts`, add the import at the top:

```typescript
import { createTracker, type TrackFn } from './analytics.ts'
```

Add `track` to the `AppContext` interface:

```typescript
export interface AppContext {
  env: Env
  db: Database
  mailer: Mailer
  auth: AuthInstance
  s3: S3
  mediaEnv: MediaEnv
  boss: PgBoss
  cache: Cache
  pubsub: PubSub
  log: Logger
  rateLimit: ReturnType<typeof makeRateLimit>
  track: TrackFn
}
```

At the end of `buildContext()`, create the tracker and add it to the return:

```typescript
  const track = createTracker(env.DATABUDDY_API_KEY, log)

  return { env, db, mailer, auth, s3, mediaEnv, boss, cache, pubsub, log, rateLimit, track }
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/analytics.ts apps/api/src/lib/context.ts
git commit -m "feat: add server-side Databuddy analytics client to API context"
```

---

### Task 4: Add `ctx.track()` calls to posts route

**Files:**
- Modify: `apps/api/src/routes/posts.ts`

For each mutation endpoint, add a `ctx.track()` call right before the response is returned. The `ctx` is accessed via `c.get('ctx')`. The pattern is:

```typescript
c.get('ctx').track('event_name', session.user.id, { optional: 'props' })
```

- [ ] **Step 1: Add tracking to all post mutation endpoints**

Add `c.get('ctx').track(...)` calls to these endpoints (right before the `return c.json(...)` line in each):

**POST `/` (create post)** — line ~274, before `return c.json({ post: dto }, 201)`:
```typescript
  c.get('ctx').track('post_created', session.user.id, {
    has_media: !!body.mediaIds?.length,
    has_poll: !!body.poll,
    is_reply: !!body.replyToId,
    is_quote: !!body.quoteOfId,
  })
```

**POST `/:id/repost`** — line ~333, before `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('post_reposted', session.user.id)
```

**DELETE `/:id/repost`** — before its `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('post_unreposted', session.user.id)
```

**POST `/:id/like`** — before its `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('post_liked', session.user.id)
```

**DELETE `/:id/like`** — before its `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('post_unliked', session.user.id)
```

**POST `/:id/bookmark`** — before its `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('post_bookmarked', session.user.id)
```

**DELETE `/:id/bookmark`** — before its `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('post_unbookmarked', session.user.id)
```

**PATCH `/:id` (edit post)** — before its return:
```typescript
  c.get('ctx').track('post_edited', session.user.id)
```

**POST `/:id/pin`** — before its return:
```typescript
  c.get('ctx').track('post_pinned', session.user.id)
```

**DELETE `/:id/pin`** — before its return:
```typescript
  c.get('ctx').track('post_unpinned', session.user.id)
```

**DELETE `/:id` (delete post)** — before its return:
```typescript
  c.get('ctx').track('post_deleted', session.user.id)
```

**POST `/:id/hide`** — before its return:
```typescript
  c.get('ctx').track('post_hidden', session.user.id)
```

**DELETE `/:id/hide`** — before its return:
```typescript
  c.get('ctx').track('post_unhidden', session.user.id)
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/posts.ts
git commit -m "feat: add server-side analytics tracking to posts route"
```

---

### Task 5: Add `ctx.track()` calls to users route

**Files:**
- Modify: `apps/api/src/routes/users.ts`

- [ ] **Step 1: Add tracking to all user relationship endpoints**

**POST `/:handle/follow`** — before `return c.json({ ok: true })`:
```typescript
  c.get('ctx').track('user_followed', session.user.id)
```

**DELETE `/:handle/follow`** — before return:
```typescript
  c.get('ctx').track('user_unfollowed', session.user.id)
```

**POST `/:handle/block`** — before return:
```typescript
  c.get('ctx').track('user_blocked', session.user.id)
```

**DELETE `/:handle/block`** — before return:
```typescript
  c.get('ctx').track('user_unblocked', session.user.id)
```

**POST `/:handle/mute`** — before return:
```typescript
  c.get('ctx').track('user_muted', session.user.id)
```

**DELETE `/:handle/mute`** — before return:
```typescript
  c.get('ctx').track('user_unmuted', session.user.id)
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
git add apps/api/src/routes/users.ts
git commit -m "feat: add server-side analytics tracking to users route"
```

---

### Task 6: Add `ctx.track()` calls to me, articles, lists, polls, reports, search, scheduled-posts, chess routes

**Files:**
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/routes/articles.ts`
- Modify: `apps/api/src/routes/lists.ts`
- Modify: `apps/api/src/routes/polls.ts`
- Modify: `apps/api/src/routes/reports.ts`
- Modify: `apps/api/src/routes/search.ts`
- Modify: `apps/api/src/routes/scheduled-posts.ts`
- Modify: `apps/api/src/routes/chess.ts`

- [ ] **Step 1: me.ts**

**PATCH `/` (update profile)** — before return:
```typescript
  c.get('ctx').track('profile_updated', session.user.id)
```

**POST `/handle` (claim handle)** — before return:
```typescript
  c.get('ctx').track('handle_claimed', session.user.id, { handle: body.handle })
```

- [ ] **Step 2: articles.ts**

**POST `/` (create article)** — before return:
```typescript
  c.get('ctx').track('article_created', session.user.id)
```

**PATCH `/:id` (update article)** — before return:
```typescript
  c.get('ctx').track('article_updated', session.user.id)
```

**DELETE `/:id` (delete article)** — before return:
```typescript
  c.get('ctx').track('article_deleted', session.user.id)
```

- [ ] **Step 3: lists.ts**

**POST `/` (create list)** — before return:
```typescript
  c.get('ctx').track('list_created', session.user.id)
```

**DELETE `/:id` (delete list)** — before return:
```typescript
  c.get('ctx').track('list_deleted', session.user.id)
```

**POST `/:id/members` (add members)** — before return:
```typescript
  c.get('ctx').track('list_members_added', session.user.id, { count: body.userIds.length })
```

**DELETE `/:id/members/:memberId` (remove member)** — before return:
```typescript
  c.get('ctx').track('list_member_removed', session.user.id)
```

- [ ] **Step 4: polls.ts**

**POST `/:pollId/vote`** — before return:
```typescript
  c.get('ctx').track('poll_voted', session.user.id)
```

- [ ] **Step 5: reports.ts**

**POST `/` (create report)** — before return:
```typescript
  c.get('ctx').track('content_reported', session.user.id, { subject_type: body.subjectType })
```

- [ ] **Step 6: search.ts**

**POST `/saved`** — before return:
```typescript
  c.get('ctx').track('search_saved', session.user.id)
```

**DELETE `/saved/:id`** — before return:
```typescript
  c.get('ctx').track('search_saved_deleted', session.user.id)
```

- [ ] **Step 7: scheduled-posts.ts**

**POST `/:id/publish`** — before return:
```typescript
  c.get('ctx').track('scheduled_post_published', session.user.id)
```

- [ ] **Step 8: chess.ts**

**POST `/` (create game)** — before return:
```typescript
  c.get('ctx').track('chess_game_created', session.user.id)
```

- [ ] **Step 9: Typecheck and commit**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
git add apps/api/src/routes/me.ts apps/api/src/routes/articles.ts apps/api/src/routes/lists.ts apps/api/src/routes/polls.ts apps/api/src/routes/reports.ts apps/api/src/routes/search.ts apps/api/src/routes/scheduled-posts.ts apps/api/src/routes/chess.ts
git commit -m "feat: add server-side analytics tracking to remaining routes"
```

---

### Task 7: Add `ctx.track()` calls to DMs route

**Files:**
- Modify: `apps/api/src/routes/dms.ts`

- [ ] **Step 1: Add tracking to DM mutation endpoints**

**POST `/` (start DM / create group)** — before return. The route creates either a 1:1 DM or a group, distinguishable by member count:
```typescript
  c.get('ctx').track(peerIds.length > 1 ? 'dm_group_created' : 'dm_started', me)
```

**POST `/:id/messages` (send message)** — before return:
```typescript
  c.get('ctx').track('dm_sent', me)
```

**PATCH `/:id/messages/:msgId` (edit message)** — before return:
```typescript
  c.get('ctx').track('dm_message_edited', me)
```

**DELETE `/:id/messages/:msgId` (delete message)** — before return:
```typescript
  c.get('ctx').track('dm_message_deleted', me)
```

**POST `/:id/messages/:msgId/reactions` (toggle reaction)** — before return:
```typescript
  c.get('ctx').track('dm_reaction_toggled', me)
```

**POST `/:id/members` (add members)** — before return:
```typescript
  c.get('ctx').track('dm_members_added', me, { count: body.userIds.length })
```

**DELETE `/:id/members/:userId` (remove member)** — before return:
```typescript
  c.get('ctx').track('dm_member_removed', me)
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
git add apps/api/src/routes/dms.ts
git commit -m "feat: add server-side analytics tracking to DMs route"
```

---

### Task 8: Add `ctx.track()` calls to admin route

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Add tracking to admin mutation endpoints**

**POST `/users/:id/ban`** — before return:
```typescript
  c.get('ctx').track('admin_user_banned', session.user.id, { target_user_id: id })
```

**POST `/users/:id/unban`** — before return:
```typescript
  c.get('ctx').track('admin_user_unbanned', session.user.id, { target_user_id: id })
```

**POST `/users/:id/shadowban`** — before return:
```typescript
  c.get('ctx').track('admin_user_shadowbanned', session.user.id, { target_user_id: id })
```

**POST `/users/:id/unshadowban`** — before return:
```typescript
  c.get('ctx').track('admin_user_unshadowbanned', session.user.id, { target_user_id: id })
```

**POST `/users/:id/role`** — before return:
```typescript
  c.get('ctx').track('admin_user_role_set', session.user.id, { target_user_id: id, role: body.role })
```

**POST `/users/:id/verify`** — before return:
```typescript
  c.get('ctx').track('admin_user_verified', session.user.id, { target_user_id: id })
```

**POST `/users/:id/unverify`** — before return:
```typescript
  c.get('ctx').track('admin_user_unverified', session.user.id, { target_user_id: id })
```

**POST `/users/:id/handle`** — before return:
```typescript
  c.get('ctx').track('admin_user_handle_set', session.user.id, { target_user_id: id })
```

**DELETE `/posts/:id`** — before return:
```typescript
  c.get('ctx').track('admin_post_deleted', session.user.id)
```

**DELETE `/users/:id`** — before return:
```typescript
  c.get('ctx').track('admin_user_deleted', session.user.id, { target_user_id: id })
```

**PATCH `/reports/:id`** — before return:
```typescript
  c.get('ctx').track('admin_report_resolved', session.user.id)
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/api typecheck
git add apps/api/src/routes/admin.ts
git commit -m "feat: add server-side analytics tracking to admin route"
```

---

### Task 9: Strip `trackedAction()` from all frontend files

**Files:**
- Modify: 20 frontend files (listed below)

Every `trackedAction()` call wraps an API call like this:

```typescript
await trackedAction("post_liked", () => api.like(post.id))
```

Replace each with just the inner function call:

```typescript
await api.like(post.id)
```

If `trackedAction` uses the third arg (property getter), drop it entirely — the server now tracks it.

- [ ] **Step 1: Replace all `trackedAction()` calls with their inner function**

Apply this transformation to every file. The files and their `trackedAction` imports:

1. `apps/web/src/components/compose.tsx` — remove `trackedAction` import, replace call
2. `apps/web/src/components/edit-post-dialog.tsx` — remove `trackedAction` import, replace call
3. `apps/web/src/components/poll-block.tsx` — remove `trackedAction` import, replace call
4. `apps/web/src/components/report-dialog.tsx` — remove `trackedAction` import, replace call
5. `apps/web/src/components/post-menu.tsx` — remove `trackedAction` import, replace all 5 calls
6. `apps/web/src/components/profile-actions.tsx` — remove `trackedAction` import, replace all 7 calls
7. `apps/web/src/components/claim-handle.tsx` — remove `trackedAction` import, replace call
8. `apps/web/src/components/post-card.tsx` — remove `trackedAction` import, replace all 7 calls. **Keep** the `recordImpression` import — impressions stay client-side.
9. `apps/web/src/components/chat-widget.tsx` — remove `trackedAction` import, replace call
10. `apps/web/src/routes/settings.tsx` — remove `trackedAction` import, replace all calls
11. `apps/web/src/routes/inbox.new.tsx` — remove `trackedAction` import, replace calls
12. `apps/web/src/routes/inbox.$conversationId.tsx` — remove `trackedAction` import, replace all 5 calls
13. `apps/web/src/routes/drafts.tsx` — remove `trackedAction` import, replace call
14. `apps/web/src/routes/search.tsx` — remove `trackedAction` import, replace all 3 calls
15. `apps/web/src/routes/articles.new.tsx` — remove `trackedAction` import, replace call
16. `apps/web/src/routes/articles.$id.edit.tsx` — remove `trackedAction` import, replace call
17. `apps/web/src/routes/admin.reports.tsx` — remove `trackedAction` import, replace call
18. `apps/web/src/routes/admin.users.tsx` — remove `trackedAction` import, replace all 9 calls
19. `apps/web/src/routes/lists.$id.tsx` — remove `trackedAction` import, replace all 3 calls
20. `apps/web/src/routes/lists.index.tsx` — remove `trackedAction` import, replace call

Example transformation pattern:

```typescript
// Before
import { trackedAction } from "../lib/analytics"
// ...
await trackedAction("post_liked", () => api.like(post.id))

// After (remove the import line entirely, replace the call)
await api.like(post.id)
```

For calls where `trackedAction` wraps a function with a result callback:

```typescript
// Before
const result = await trackedAction(
  "post_created",
  () => api.createPost(body),
  (r) => ({ has_media: !!r.post.media?.length }),
)

// After
const result = await api.createPost(body)
```

- [ ] **Step 2: Verify no `trackedAction` imports remain**

```bash
cd /private/tmp/twitbruv && grep -r "trackedAction" apps/web/src/ --include="*.ts" --include="*.tsx"
```

Expected: No matches (the function definition in analytics.ts will also be removed in the next task).

- [ ] **Step 3: Commit**

```bash
cd /private/tmp/twitbruv && git add apps/web/src/components/ apps/web/src/routes/
git commit -m "refactor: remove trackedAction from frontend, tracking now server-side"
```

---

### Task 10: Clean up `apps/web/src/lib/analytics.ts`

**Files:**
- Modify: `apps/web/src/lib/analytics.ts`

- [ ] **Step 1: Remove `trackedAction` and `EventName`, keep `recordImpression` and `track` re-export**

Replace the entire file with:

```typescript
import { track } from "@databuddy/sdk"

import { API_URL } from "./env"

export { track }

interface ImpressionEvent {
  kind: "impression"
  subjectType: "post" | "article" | "profile"
  subjectId: string
}

// Dedupe within a single tab-session so scrolling a post back into view doesn't re-count.
const seen = new Set<string>()
const key = (e: ImpressionEvent) => `${e.subjectType}:${e.subjectId}`

const buffer: Array<ImpressionEvent> = []
let flushTimer: number | null = null

function schedule() {
  if (typeof window === "undefined") return
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(flush, 5000)
}

async function flush() {
  if (typeof window === "undefined") return
  flushTimer = null
  if (buffer.length === 0) return
  const events = buffer.splice(0, buffer.length)
  try {
    await fetch(`${API_URL}/api/analytics/ingest`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    })
  } catch {
    // best-effort; drop on failure
  }
}

export function recordImpression(event: ImpressionEvent) {
  if (typeof window === "undefined") return
  const k = key(event)
  if (seen.has(k)) return
  seen.add(k)
  buffer.push(event)
  schedule()
}

// Flush on pagehide / visibilitychange using sendBeacon so nothing gets dropped on nav.
if (typeof window !== "undefined") {
  const beacon = () => {
    if (buffer.length === 0) return
    const events = buffer.splice(0, buffer.length)
    try {
      const blob = new Blob([JSON.stringify({ events })], {
        type: "application/json",
      })
      navigator.sendBeacon(`${API_URL}/api/analytics/ingest`, blob)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener("pagehide", beacon)
  window.addEventListener("beforeunload", beacon)
}
```

- [ ] **Step 2: Typecheck the web app**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/web typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/analytics.ts
git commit -m "refactor: remove trackedAction and EventName from frontend analytics"
```

---

### Task 11: Enhance `<Databuddy>` component props and add devtools

**Files:**
- Modify: `apps/web/src/routes/__root.tsx`

- [ ] **Step 1: Add devtools import and enhance Databuddy props**

Add the devtools import near the other imports:

```typescript
import { DatabuddyDevtools } from "@databuddy/devtools/react"
```

Replace the current `<Databuddy>` block (lines 86-92):

```typescript
            {DATABUDDY_CLIENT_ID ? (
              <Databuddy
                clientId={DATABUDDY_CLIENT_ID}
                trackWebVitals
                trackErrors
              />
            ) : null}
```

With:

```typescript
            {DATABUDDY_CLIENT_ID ? (
              <Databuddy
                clientId={DATABUDDY_CLIENT_ID}
                trackWebVitals
                trackErrors
                trackPerformance
                trackOutgoingLinks
                trackInteractions
                enableBatching
                batchSize={20}
                maskPatterns={["/inbox/*", "/admin/*"]}
              />
            ) : null}
            <DatabuddyDevtools enabled={import.meta.env.DEV} />
```

- [ ] **Step 2: Typecheck**

```bash
cd /private/tmp/twitbruv && bun run --cwd apps/web typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/__root.tsx
git commit -m "feat: enhance Databuddy client props and add devtools overlay"
```

---

### Task 12: Full build verification

- [ ] **Step 1: Run full typecheck across the monorepo**

```bash
cd /private/tmp/twitbruv && bun run typecheck
```

Expected: All packages pass.

- [ ] **Step 2: Run lint**

```bash
cd /private/tmp/twitbruv && bun run lint
```

Expected: No errors introduced.

- [ ] **Step 3: Run build**

```bash
cd /private/tmp/twitbruv && bun run build
```

Expected: Build succeeds for all apps.
