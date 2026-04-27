# Twitbruv `For You` Feed: Implementation Plan

This document is intentionally **repository-specific**.

It explains how the generalized decisions in `ALGO_DESIGN.md` map onto the current monorepo:

- where the new ranker service lives
- what stays in `apps/api`
- what becomes shared code in `packages/*`
- what needs to change in `apps/web`
- how request flow, caching, analytics, and pagination integrate with the code that already exists

For generalized rationale and system design, see:

- `ALGO_DESIGN.md`

## Goal

Ship a real `For You` feed that is:

- better than reverse-chronological follow-only ranking
- small enough to actually implement in this repo soon
- isolated from core API traffic
- measurable
- easy to iterate on

In this codebase, the main idea is:

- add **one new internal service**: `apps/feed-ranker`
- add **one small shared helper layer** for feed policy + experiment/version logic
- keep **post hydration and response shaping** in `apps/api`
- use the **existing schema first**
- use **Redis-backed ranking sessions** for stable pagination
- add **timeouts, caching, fallback, and analytics markers** from day one

---

## Concrete v1 shape in this repo

In this repo, v1 means wiring the design into these concrete pieces:

- **TypeScript**, not Go
- **a separate internal ranker service** at `apps/feed-ranker`
- **a composable internal pipeline** inside the ranker
  - query context hydration → sources → pre-filters → scorers/rerankers → post-selection checks → side effects
- **shared feed policy helpers** so API and ranker use the same visibility/block/mute rules
- **shared bucketing + `algoVersion` helpers** so API knows the variant before cache lookup
- **explicit candidate metadata** such as `sourceBucket` and `networkClass`
- **semantic dedup**, not just exact post-ID dedup
- **author-diversity attenuation** as part of ranking, not only hard caps
- **an API route** at `GET /api/feed/for-you`
- **first-page caching** in `apps/api`
- **stable ranked pagination** using Redis session cursors
- **a clear distinction between `served` and `seen` content state**
- **deterministic experiment bucketing**
- **feed-context-aware analytics** for impressions and engagements
- **fallback behavior** if ranking is slow or unavailable on page 1
- **restart-required behavior** for expired ranked cursors on page 2+

And in this repo, v1 should **not** expand into:

- a Go service
- a feature store
- a vector DB
- ANN retrieval
- ML ranking
- a Thunder-like realtime candidate service
- a big precomputed feature pipeline
- a per-user/per-post `network_post_signals (user_id, post_id)` table

---

## Why this shape fits the current repo

This section is specifically about the **current code structure**, not the generalized design rationale.

The repo already has the right split points:

- `apps/api` for user-facing HTTP routes and hydration
- `apps/worker` for async jobs
- `packages/db` for schema/shared DB access
- `packages/types` for shared TS contracts/helpers
- Redis already exists and is used for caching

The existing feed code already gives us:

- reverse-chrono following feed in `apps/api/src/routes/feed.ts`
- network-adjacent feed logic in `apps/api/src/routes/feed.ts`
- public feed logic in `apps/api/src/routes/posts.ts`
- impression ingestion in `apps/api/src/routes/analytics.ts`
- client-side impression tracking in `apps/web/src/lib/analytics.ts`
- DTO hydration pipeline in `apps/api/src/lib/post-dto.ts` and related loaders

That means the cheapest implementation path is:

1. rank IDs in a new service
2. send ordered post IDs back to the API
3. let the API hydrate them with the existing pipeline

---

## Scope of v1

### In scope

- `For You` tab/feed for signed-in users
- one new service: `feed-ranker`
- one small shared helper layer for experiments/contracts/feed policy
- candidate generation from existing data
- heuristic scoring
- diversity/reranking pass
- opaque cursoring via Redis ranking sessions
- page-0 cache in API
- deterministic user bucketing
- feed analytics metadata (`surface`, `algoVersion`, `variant`, `position`)
- strict timeout and fallback on page 1
- explicit restart behavior for expired ranked sessions on page 2+

### Out of scope

- model training
- online feature store
- embeddings
- topic clustering
- large-scale offline backfills
- full explainability UI
- replacing existing Following / Network / All feeds

---

## Product behavior

### Initial rollout behavior

On the home page, we should add a new tab:

- `For You`
- `Following`
- `Network`
- `All`

For rollout, the default tab should stay:

- **`Following`**, not `For You`

That gives us room to test without making the algo the default immediately.

### Messaging note

The landing page currently says things like:

- “No black-box feeds”
- “without model-driven ranking”

So `For You` should be framed as:

- optional
- heuristic first
- non-ML
- measurable and iterated deliberately

---

## High-level architecture in this repo

The purpose of this section is to show **how the new pieces fit into the existing codebase**.

We do not restate the generalized recommendation-system rationale here; `ALGO_DESIGN.md` covers that.

### Shared modules

Before we add the ranker, we should extract two tiny shared layers.

#### `packages/db`: feed policy helpers

Shared predicates/helpers for:

- `deletedAt is null`
- public visibility requirements
- block relationships
- feed mutes
- common viewer-specific exclusions

Both `apps/api` and `apps/feed-ranker` should import these.

#### `packages/types`: feed-ranking contracts/helpers

Shared pure code for:

- `algoVersion`
- deterministic `variant` bucketing
- API <-> ranker request/response types
- ranked-session cursor payload types if useful
- small shared enums/types like `networkClass`

The API must know the variant **before** page-0 cache lookup, so this cannot live only inside the ranker.

### Internal ranker pipeline

Inside `apps/feed-ranker`, organize the work as stages.

This is not just an abstract pattern; it is the shape we want the new service code to take in this repo:

1. **Query context hydration**
   - follow/block/mute state
   - recent interaction context
   - pagination/session context
2. **Candidate sources**
   - network-adjacent
   - affinity-author
   - fresh public discovery
3. **Candidate hydrators / feature loaders**
   - lightweight derived features
   - `sourceBucket`
   - `networkClass`
4. **Pre-scoring filters**
   - exact duplicate removal
   - repost/original dedup
   - self-post suppression
   - age limits
   - block/mute filtering
   - low-signal reply suppression
   - served/seen suppression where applicable
5. **Scorers**
   - heuristic feature blend
   - optional network-class adjustments
6. **Selector / rerankers**
   - top-K selection
   - author-diversity attenuation
   - source-bucket caps
   - freshness balance
7. **Post-selection checks**
   - final safety checks
   - conversation/thread dedup
8. **Side effects**
   - ranked-session persistence
   - cache/logging hooks

This gives us a clean place to evolve the ranking logic without overcommitting to heavyweight infra.

### Request flow in the current app

1. Client requests `GET /api/feed/for-you`
2. `apps/api` authenticates the user
3. `apps/api` computes `variant` + `algoVersion` from shared code
4. `apps/api` checks first-page cache when eligible
5. `apps/api` calls `apps/feed-ranker` with strict timeout
6. `feed-ranker` hydrates query context, generates candidates, filters, scores, reranks, stores/reads ranked session state, and returns ordered post IDs
7. `apps/api` loads posts by ID and hydrates with the existing DTO pipeline
8. `apps/api` applies final safety filtering before responding
9. `apps/api` returns:
   - `posts`
   - `nextCursor`
   - `algoVersion`
   - `variant`
   - optional `fallback: true` marker if we want debugging visibility

### What moves where

To keep responsibilities clear in the current codebase:

- **stays in `apps/api`**
  - auth/session handling
  - client route contract
  - post hydration / DTO shaping
  - final response safety filtering
  - page-0 cache lookup and fallback policy
- **moves into `apps/feed-ranker`**
  - query context hydration for ranking
  - candidate sourcing
  - pre-scoring filters
  - scoring / reranking
  - ranked-session cursor storage and lookup
- **becomes shared in `packages/*`**
  - feed-policy helpers
  - bucketing/version helpers
  - ranker contracts and tiny ranking enums/types
- **gets threaded into `apps/web`**
  - new tab
  - feed-context-aware analytics metadata
  - restart-required handling for expired ranked sessions

### Service boundaries

#### `apps/feed-ranker`
Owns:

- query context hydration
- candidate generation
- lightweight feature extraction
- pre-scoring filters
- heuristic scoring
- reranking/diversity
- post-selection checks on ranked IDs
- ranked session storage + cursor validation
- ranker-side side effects

Returns:

- ordered `postIds`
- `nextCursor`
- `algoVersion`
- `variant`

#### `apps/api`
Owns:

- auth/session handling
- client-facing route contract
- experiment assignment before cache lookup
- hydration/DTO shaping
- media/article/repost/quote/reply-parent/poll loading
- viewer flags
- final safety filtering
- caching first page
- timeout/fallback policy
- handling expired session responses from the ranker

#### Shared helpers
Own:

- `algoVersion`
- deterministic bucketing
- common feed eligibility rules
- internal request/response contracts
- tiny shared ranking enums/types

---

## Concrete implementation plan

# Phase 0: extract shared helpers first

This is a prerequisite, not a nice-to-have.

## New shared files

Create:

- `packages/db/src/feed-policy.ts`
- `packages/types/src/feed-ranking.ts`

## `packages/db/src/feed-policy.ts`

Export shared helpers for ranker/API reuse, for example:

- `isVisibleFeedPost()`
- `excludeViewerBlocks(viewerId, authorId)`
- `excludeViewerFeedMutes(viewerId, authorId)`
- `excludeViewerOwnPosts(viewerId, authorId)` where useful

The exact helper shape can be `sql` fragments or small query-builder helpers, but the key point is:

- the ranker and API must not hand-roll slightly different copies of block/mute/visibility logic

## `packages/types/src/feed-ranking.ts`

Export shared pure values/helpers such as:

- `FOR_YOU_ALGO_VERSION = "for_you_v1"`
- `bucketForYouVariant(userId)`
- `ForYouRankRequest`
- `ForYouRankResponse`
- `ForYouSessionCursorPayload`
- `ForYouNetworkClass = "following" | "adjacent" | "discovery"`
- `ForYouSourceBucket = "network" | "affinity" | "public"`

This lets the API:

- compute `variant` before cache lookup
- use the same constants as the ranker
- share small contract types with the ranker without pushing ranker internals into the client API layer

---

# Phase 1: add the new ranker app

## New app

Create:

- `apps/feed-ranker/package.json`
- `apps/feed-ranker/tsconfig.json`
- `apps/feed-ranker/src/index.ts`
- `apps/feed-ranker/src/env.ts`
- `apps/feed-ranker/src/lib/query-context.ts`
- `apps/feed-ranker/src/lib/pipeline.ts`
- `apps/feed-ranker/src/lib/candidates.ts`
- `apps/feed-ranker/src/lib/filters.ts`
- `apps/feed-ranker/src/lib/scorers.ts`
- `apps/feed-ranker/src/lib/rerank.ts`
- `apps/feed-ranker/src/lib/cursor.ts`
- `apps/feed-ranker/src/lib/side-effects.ts`
- `apps/feed-ranker/src/lib/logger.ts` (optional)

The exact split can vary, but the internals should map cleanly to the pipeline stages described above.

Use the same stack as the API where practical:

- Bun
- Hono
- `@workspace/db`
- `@workspace/types`
- `ioredis`
- `zod`
- `pino`

## Internal route

Expose a single internal route for v1, for example:

- `POST /internal/for-you`

Request body:

```json
{
  "userId": "uuid",
  "limit": 60,
  "cursor": null,
  "algoVersion": "for_you_v1",
  "variant": "for_you_v1_a"
}
```

Response body:

```json
{
  "postIds": ["uuid", "uuid"],
  "nextCursor": "opaque-cursor-or-null",
  "algoVersion": "for_you_v1",
  "variant": "for_you_v1_a"
}
```

The ranker should return **IDs only**, not hydrated posts.

## Expired-session response

When a cursor references a missing or expired ranked session, the ranker should **not** silently rerank from scratch and it should **not** switch to fallback behavior.

Recommended response:

- HTTP `410`
- body like:

```json
{
  "error": "session_expired",
  "restartRequired": true
}
```

The API can translate that into a client-visible restart signal.

## Environment variables

### Add to `apps/api`

- `FEED_RANKER_URL`
- `FEED_RANKER_TOKEN`
- `FEED_RANKER_TIMEOUT_MS=120`

### Add to `apps/feed-ranker`

- `INTERNAL_SERVICE_TOKEN`
- `DATABASE_URL`
- `REDIS_URL`
- `DB_POOL_MAX=5` or `10`
- normal logging envs

The API should authenticate to the ranker using a shared bearer token or equivalent internal header.

The ranker should have a smaller DB pool than the main API by default.

---

# Phase 2: candidate generation using existing schema first

## Principle

Do **not** start by adding new ranking tables.

Use the schema we already have:

- `posts`
- `likes`
- `follows`
- `blocks`
- `mutes`
- repost rows via `posts.repostOfId`
- post counters already on `posts`

This is enough for a good v1.

## Query context hydration

Before candidate sourcing, build a compact `QueryContext` with things like:

- viewer follow/block/mute state
- recent interaction summary for affinity seeding
- `variant` + `algoVersion`
- ranked-session cursor state
- any request-local `served` state derived from the ranked session

Important distinction:

- **served** = content already issued by this ranked session / page flow
- **seen** = content the user likely encountered recently via impressions or other recent feed state

For v1, `served` handling is required and `seen` suppression can stay lightweight or optional.

## Candidate metadata

Each candidate should carry:

- `sourceBucket`
  - `network` | `affinity` | `public`
- `networkClass`
  - `following` | `adjacent` | `discovery`

This is useful for:

- scoring
- diversity/reranking policy
- experiment analysis
- future surface-specific safety rules

## Candidate buckets

Generate candidates from three buckets.

### Bucket A: network-adjacent posts

Use the same core idea as the existing `GET /api/feed/network` route.

Source candidates from:

- posts liked by people the viewer follows
- posts reposted by people the viewer follows

Constraints:

- exclude deleted posts
- exclude non-public posts
- exclude blocked/muted authors
- exclude the viewer’s own posts
- exclude posts from authors the viewer already follows
- surface the **original post**, not the repost row itself
- label these candidates as `sourceBucket=network`, `networkClass=adjacent`

This gives us “people you may care about because your network engaged with it.”

### Bucket B: affinity-author posts, computed on demand

Do not add a `user_author_affinity` table yet.

Instead, compute a lightweight affinity score on demand from recent interaction history, for example over the last 30 days:

- likes by viewer on author’s posts
- replies by viewer to author
- reposts by viewer of author
- bookmarks if we want one more light signal

From that, derive a small set of top authors and fetch recent public posts from them.

Important explicit choice for v1:

- this bucket **may include followed authors**, but cap their presence in the top results so `For You` stays discovery-oriented
- e.g. no more than roughly **25% of the first 20 results** from followed authors unless later tuning says otherwise
- if the author is followed, mark `networkClass=following`
- if not followed, mark `networkClass=adjacent`

This gives us a useful “you often engage with this author” signal without a new feature pipeline.

### Bucket C: fresh public posts

Use the same general idea as the current public feed in `apps/api/src/routes/posts.ts`, but be stricter than the raw public timeline.

Source candidates from:

- recent public original posts
- recent public quote posts
- likely within the last 24–48 hours
- filtered for deletion, visibility, blocks, and mutes

For v1, Bucket C should **not** directly include:

- repost rows as standalone candidates
- low-signal replies unless they already have strong network/engagement proof

Label these candidates as:

- `sourceBucket=public`
- `networkClass=discovery`

This keeps the discovery pool higher-signal than the plain public timeline.

## Candidate count

After:

- exact post-ID dedup
- repost/original semantic dedup
- basic eligibility filtering

cap the total candidate pool to roughly:

- **150–250 posts** per request

That is plenty for v1 and should be easy to score in TypeScript.

---

# Phase 3: features and heuristic scoring

## Pre-scoring filters

Before scoring, run a cheap/high-value filter pass over the candidate pool.

Required v1 filters:

- exact post-ID dedup
- repost/original dedup
- self-post filtering where appropriate
- age cutoffs
- blocks / mutes
- low-signal reply suppression
- `served` suppression for ranked pagination

Nice-to-have if cheap:

- lightweight `seen` suppression from recent `For You` impression state
- muted-keyword filtering if we can source it cleanly

## Features to compute per candidate

Use lightweight features only:

- `ageHours`
- `networkLikeCount`
- `networkRepostCount`
- `authorAffinityScore`
- `likeCount`
- `repostCount`
- `replyCount`
- `quoteCount`
- `recentEngagement30m`
- `recentEngagement6h`
- `isReply`
- `isFollowedAuthor`
- `sourceBucket`
- `networkClass`

Important nuance:

- `recentEngagement30m` / `6h` should be computed on demand for the final candidate set if we have not yet built aggregate tables
- `sourceBucket` is useful for ranker-side debugging, but should stay server-side unless we explicitly choose to expose per-item feed context to the client
- `networkClass` is worth carrying explicitly because it can affect scoring and policy even when the source bucket is the same

## Initial heuristic formula

Start with a simple base score like:

```txt
baseScore =
  + 2.0 * networkRepostCount
  + 1.5 * networkLikeCount
  + 1.2 * authorAffinityScore
  + 1.0 * recentEngagement30m
  + 0.6 * recentEngagement6h
  + 0.6 * log1p(likeCount + repostCount * 2 + replyCount * 1.5 + quoteCount * 1.5)
  - 0.35 * ageHours
  - 1.5 if reply with weak signals
```

Then allow a small adjustment layer for:

- `networkClass`
- discovery caps / attenuation
- later, negative-feedback risk if we instrument it cleanly

The exact numbers are tunable.

The important behavior is:

- network proof matters
- authors the user tends to care about matter
- recent engagement matters, not just lifetime counts
- stale posts decay
- low-signal replies are penalized
- pure discovery does not overwhelm the top of feed

## Diversity / reranking pass

After base scoring, apply a reranking pass.

### Author diversity attenuation

Do not rely only on hard caps.

Also apply a score decay for repeated authors within the ranked set, e.g.:

- first post from author: full score
- second post: attenuated score
- third+ post: further attenuated, plus possible hard cap in top windows

This usually gives a better result than binary allow/disallow rules alone.

### Additional reranking rules

For v1:

- max 2 posts per author in the first 20 results
- prevent replies from dominating the top of feed
- keep some freshness in the first screen
- avoid one source bucket taking over the first 20
- cap followed-author presence in the first 20

## Post-selection checks

After selecting the top-ranked IDs, run one more pass for:

- final safety / visibility checks
- conversation/thread dedup where needed
- any late route-level exclusions that are cheaper to enforce after ranking

This keeps the system aligned with the general pattern:

- pre-scoring filters to avoid wasted work
- scoring / reranking for relevance and diversity
- post-selection checks to protect final response quality

---

# Phase 4: cursor strategy for ranked feeds

## Problem

The current repo paginates feeds with timestamp cursors via `apps/api/src/lib/cursor.ts`.

That works for reverse-chrono feeds, but ranked feeds are different:

- scores can change while the user is scrolling
- candidates can change between page loads
- naive timestamp cursors create duplicates, missing results, and unstable ordering

## Solution: Redis-backed ranking sessions

For `For You`, page 1 should create a short-lived ranked session.

### Page 1 behavior

1. rank the top ~200 post IDs
2. store them in Redis under a session key
3. return the first page of IDs plus an opaque cursor

### Seen vs served semantics

Within ranked pagination:

- `served` means IDs already handed out from this ranked session
- `seen` means broader recent exposure state outside the current session

The ranked session should be the source of truth for `served` behavior. We should not collapse `served` and `seen` into one concept.

### Redis session key

Example:

- `feed:foryou:session:${sessionId}:v1`

Stored value:

```json
{
  "userId": "viewer-uuid",
  "postIds": ["..."],
  "algoVersion": "for_you_v1",
  "variant": "for_you_v1_a",
  "snapshotAt": "2026-04-27T00:00:00.000Z"
}
```

TTL:

- **10 minutes**

### Cursor payload

Cursor should be opaque and encode:

- `sessionId`
- `offset`

Example logical payload:

```json
{
  "s": "abc123",
  "o": 40
}
```

Then base64url-encode it.

### Why this is the right v1 solution

This avoids:

- score drift across pages
- duplicate rows
- missing rows
- complex score+timestamp cursors

It also fits well with our existing Redis setup.

### Expired-session semantics

If the client asks for page 2+ and the session is gone:

- do **not** silently drop to fallback feed logic
- do **not** regenerate a new ranking session under the same cursor
- return `restartRequired`

That keeps scrolling behavior deterministic.

---

# Phase 5: API route and hydration integration

## Add API route

In `apps/api/src/routes/feed.ts`, add:

- `GET /api/feed/for-you`

## Add ranker client

Create:

- `apps/api/src/lib/feed-ranker.ts`

Responsibilities:

- call the internal ranker
- attach auth token header
- enforce timeout via abort signal
- parse response
- surface `session_expired` distinctly from generic ranker failure

## Request flow in API

For `GET /api/feed/for-you`:

1. require signed-in user with handle
2. parse `limit` and `cursor`
3. compute `variant` and `algoVersion` from shared helper code
4. if first page with default limit, check cache using `userId + variant + algoVersion`
5. call ranker with a strict timeout
6. ask ranker for a little more than the client page size
7. fetch and hydrate posts in API
8. apply final safety filtering in API
9. return hydrated posts + cursor + algo metadata

## Overfetching

The API should ask for more IDs than it needs.

Example:

- client asks for 40
- API asks ranker for 60

That helps when the API’s final safety filter removes some ranked IDs.

## Final safety filter in API

Even if the ranker already filtered candidates, the API should re-check before returning the response.

Re-check:

- `deletedAt is null`
- visibility constraints
- blocks
- mutes
- any other route-level safety constraints

These checks should use the same shared helpers introduced in Phase 0.

---

# Phase 6: fallback behavior

## Timeout budget

The ranker call should have a hard timeout around:

- **120ms**

## Fallback feed strategy

Fallback is allowed only when there is **no ranked cursor yet**.

### No cursor / page 1

If the ranker is slow or errors on page 1, the API should build a blended fallback from existing routes/queries:

1. network-adjacent items
2. then following-feed items
3. then public-feed top-up

Dedup by post ID and return the first page.

This is better than dropping directly to public chronological feed.

### Cursor present / page 2+

If the request already has a ranked cursor and the ranker returns `session_expired`:

- return a restart-required response to the client
- let the client refresh from page 1
- do **not** swap to a different feed family mid-scroll

## Principle

Ranking failure must never hurt:

- post creation
- post reads
- notifications
- session/auth flows
- other core app traffic

To support that, `feed-ranker` should run separately with:

- its own process/deployment
- its own DB pool cap
- its own resource limits

---

# Phase 7: caching

## Page-0 API cache

Cache only the first page of `For You` in the API.

Eligibility:

- no cursor
- default limit only

Example key:

- `feed:foryou:${userId}:${variant}:${algoVersion}:v1`

TTL:

- **30 seconds**

This is now safe because the API computes `variant` and `algoVersion` before cache lookup.

## Ranking-session cache

Separate from page-0 cache, the ranker stores ranked sessions in Redis.

Example key:

- `feed:foryou:session:${sessionId}:v1`

TTL:

- **10 minutes**

The two caches solve different problems:

- page-0 cache reduces repeated recomputation
- session cache stabilizes pagination

## Invalidation policy

Do **not** try to invalidate every `For You` cache on every like/repost/new post.

Use TTL-based freshness for most updates.

Only consider viewer-specific invalidation when the viewer’s graph changes materially:

- follow/unfollow
- block/unblock
- mute/unmute

If needed, use a prefix scheme like:

- `feed:foryou:${userId}:...`

and invalidate by prefix from existing API mutation routes.

---

# Phase 8: deterministic experiments

## Variant bucketing

Bucket users deterministically using something like:

- `hash(userId + experimentName)`

Initial variants:

- `for_you_v1_a`
- `for_you_v1_b`

This helper should live in shared code so:

- the API can cache by variant before calling the ranker
- the ranker and API cannot disagree about the user’s bucket

## Required response markers

Every ranked response should include:

- `algoVersion`
- `variant`

These markers should flow through to analytics events so we can tie outcomes back to a ranking formula.

---

# Phase 9: analytics changes

## Current state

The repo already has:

- client-side impression batching in `apps/web/src/lib/analytics.ts`
- post-card impression detection in `apps/web/src/components/post-card.tsx`
- ingest endpoint in `apps/api/src/routes/analytics.ts`
- `metadata` JSON field in `analytics_events`
- `event_kind` already includes both `impression` and `engagement`

That is enough to extend without a new table.

## What to add

For `For You`, store feed context on analytics events.

### Required impression metadata

- `surface: "for_you"`
- `algoVersion`
- `variant`
- `position`

### Required engagement metadata

When a user likes/reposts/replies/bookmarks from `For You`, record an `engagement` event with metadata such as:

- `surface: "for_you"`
- `algoVersion`
- `variant`
- `position`
- `action: "like" | "repost" | "reply" | "bookmark"`
- `subjectType`
- `subjectId`

This is important because impression markers alone are **not** enough to answer “likes/reposts/replies by variant”.

## API ingest changes

Update `/api/analytics/ingest` to accept:

- `kind: "impression" | "engagement"`
- optional `metadata`

and persist that metadata to `analytics_events.metadata`.

## Web analytics changes

Update the web client so analytics recording supports feed-specific context.

### Impression dedupe fix

Right now client dedupe is effectively by:

- `subjectType + subjectId`

For ranked feed analysis, that is too coarse.

If a user sees the same post in `Following` and then later in `For You`, we should still be able to count a `For You` impression.

So impression dedupe should include at least:

- `surface`
- `subjectType`
- `subjectId`

### Engagement tracking note

Do **not** rely only on existing server-side product analytics calls like `track('post_liked', ...)` for ranking evaluation.

Keep those if they are useful for general product telemetry, but the feed experiment analysis should come from `analytics_events` with explicit feed context.

### `sourceBucket` note

Do not make `sourceBucket` a required client analytics field in v1.

The client cannot infer it from feed order alone. If we later want per-bucket client analytics, we can expose per-item feed context in the API response. For now, keep `sourceBucket` ranker-side/server-side only.

---

# Phase 10: web integration

## API client

In `apps/web/src/lib/api.ts`, add:

- `forYouFeed(cursor?: string)`

And define a response type like:

```ts
export interface ForYouFeedPage extends FeedPage {
  algoVersion: string
  variant: string
}
```

## Home route

In `apps/web/src/routes/index.tsx`:

- add a `for-you` tab
- wire it to `api.forYouFeed`
- keep `Following` as the default tab during rollout

## Feed rendering

The existing `Feed` component can likely stay mostly unchanged if the response shape remains compatible with `FeedPage` plus top-level metadata.

However, we will likely need to thread feed context down to row rendering so `PostCard` can record:

- impression `surface`
- `algoVersion`
- `variant`
- `position`

and emit engagement analytics with the same context after successful actions.

---

## Exact files to add

### New files

- `apps/feed-ranker/package.json`
- `apps/feed-ranker/tsconfig.json`
- `apps/feed-ranker/src/index.ts`
- `apps/feed-ranker/src/env.ts`
- `apps/feed-ranker/src/lib/query-context.ts`
- `apps/feed-ranker/src/lib/pipeline.ts`
- `apps/feed-ranker/src/lib/candidates.ts`
- `apps/feed-ranker/src/lib/filters.ts`
- `apps/feed-ranker/src/lib/scorers.ts`
- `apps/feed-ranker/src/lib/rerank.ts`
- `apps/feed-ranker/src/lib/cursor.ts`
- `apps/feed-ranker/src/lib/side-effects.ts`
- `packages/db/src/feed-policy.ts`
- `packages/types/src/feed-ranking.ts`
- `apps/api/src/lib/feed-ranker.ts`

---

## Exact files likely to change

### API

- `apps/api/src/lib/env.ts`
  - add ranker env vars
- `apps/api/src/routes/feed.ts`
  - add `/for-you`
  - add cache key helpers
  - add fallback behavior
  - handle `session_expired`
- `apps/api/src/routes/analytics.ts`
  - accept/store feed-context metadata
- `apps/api/src/index.ts`
  - mount path likely unchanged if `feedRoute` already mounted

### Shared packages

- `packages/db/src/index.ts`
  - export `feed-policy.ts`
- `packages/types/src/index.ts`
  - export `feed-ranking.ts`

### Web

- `apps/web/src/lib/api.ts`
  - add `forYouFeed()` and types
- `apps/web/src/routes/index.tsx`
  - add new tab
- `apps/web/src/lib/analytics.ts`
  - support metadata, impressions + engagements, and better dedupe key
- `apps/web/src/components/post-card.tsx`
  - pass feed context into impression/engagement recording
- `apps/web/src/components/feed.tsx`
  - likely thread surface/algo metadata + position to row rendering

### Infra/config

- root `package.json`
  - workspace already covers `apps/*`; package export changes may be enough

---

## Suggested internal contracts

## API -> ranker request

```json
{
  "userId": "uuid",
  "limit": 60,
  "cursor": null,
  "algoVersion": "for_you_v1",
  "variant": "for_you_v1_a"
}
```

Notes:

- `limit` is the ranker fetch size, not necessarily the client page size
- page 1 can use `60` while API returns `40`
- `variant` and `algoVersion` come from shared helper code, not ranker-only logic

## ranker -> API response

```json
{
  "postIds": ["uuid1", "uuid2", "uuid3"],
  "nextCursor": "opaque-cursor",
  "algoVersion": "for_you_v1",
  "variant": "for_you_v1_a"
}
```

## ranker expired-session response

```json
{
  "error": "session_expired",
  "restartRequired": true
}
```

## API -> client response

```json
{
  "posts": [/* hydrated Post DTOs */],
  "nextCursor": "opaque-cursor",
  "algoVersion": "for_you_v1",
  "variant": "for_you_v1_a"
}
```

---

## What we explicitly defer

These are reasonable future upgrades, but they are not part of v1:

- worker-maintained per-user candidate sets
- topic affinity tables
- embeddings
- ML ranker
- a Thunder-like realtime in-network candidate service
- runtime rewrite to Go
- exposing per-item `sourceBucket` to clients

We should only add these once profiling or product feedback proves the current system is insufficient.

---

## Success criteria for v1

We can call v1 successful if:

- `GET /api/feed/for-you` works reliably for signed-in users
- p95 stays within acceptable latency for the product stage
- ranker failures cleanly fall back on page 1 without harming core API traffic
- ranked pagination is stable across multiple pages
- expired ranked sessions return a clean restart-required signal instead of silently changing feed mode
- the top of feed shows healthy diversity rather than repeating the same author/thread too often
- analytics can answer basic questions such as:
  - which variant a user saw
  - which posts were shown in `For You`
  - impression counts by position and variant
  - downstream likes/reposts/replies/bookmarks by variant
- the team can tune ranking weights without major schema or infra work

---

## Bottom line

The implementation we should actually build next is:

- **`apps/feed-ranker` in TypeScript**
- **shared feed-policy helpers and shared bucketing/version helpers**
- **an internal pipeline with query hydration, sources, pre-filters, scorers/rerankers, post-selection checks, and side effects**
- **candidate generation from existing tables**
- **heuristic ranking, not ML**
- **a small recent-window freshness signal, even before aggregate tables exist**
- **semantic dedup + author-diversity attenuation + explicit network-class labeling**
- **Redis session cursors for stable pagination**
- **`/api/feed/for-you` in the existing API**
- **page-0 cache with short TTL**
- **strict timeout, graceful page-1 fallback, and restart-required semantics for expired ranked cursors**
- **feed-context-aware analytics from day one**

This is small enough to ship, fits the current codebase, and leaves a clean path to add smarter features later if Twitbruv actually needs them.
