# Recommendation Algorithm Design

This document is intentionally **repo-agnostic**.

It describes the product/system design for a first-generation `For You` feed:

- what components should exist
- what responsibilities they should own
- what ranking mechanisms are worth adopting
- what should explicitly wait until later

It is **not** the codebase integration doc.

For repository structure, file paths, ownership inside the current monorepo, and concrete implementation sequencing, see:

- `ALGO_PLAN.md`

## Final call

For the first version of the `For You` feed:

- **Do not build the ranking system in Go.**
- **Build a separate internal ranking service in TypeScript.**
- **Keep post hydration and final response shaping in the existing client-facing API layer.**
- **Use Postgres as the primary online feature source; add aggregate tables only where they clearly improve quality or latency.**
- **If aggregate tables are not ready at launch, compute a small recent-window freshness signal on demand for the final candidate set.**
- **Use deterministic experiment bucketing and shared `algoVersion` / variant logic between the request layer and the ranking service.**
- **Structure the ranker internally as a composable pipeline: query context hydration, sources, pre-filters, scorers/rerankers, post-selection checks, and side effects.**
- **Add short-TTL caching for ranked first-page results.**
- **Use Redis-backed ranked sessions for stable pagination.**
- **Enforce strict timeout + fallback so ranking problems never hurt core post/create/read endpoints.**
- **Use shared feed eligibility/filter rules so ranking and response layers do not drift on visibility, block, mute, and deletion behavior.**

---

## Why this is the right tradeoff

This decision is based on the current product and traffic assumptions:

- target latency: **p95 under 300ms**
- freshness requirement: **30–60 seconds stale is acceptable**
- expected scale: about **5k DAU** and **up to 10k posts/day**
- ranking complexity: **heuristic now, ML later**
- candidate count: about **100–500 posts per request**
- team: **same full-stack/backend team owns it**
- ops appetite: **one extra service is acceptable**

At this stage, the main bottlenecks are much more likely to be:

- candidate fetches
- feature lookups
- joins / aggregation
- cache misses
- hydration / serialization

—not raw scoring CPU.

Because of that, a rewrite in Go would add complexity without likely producing meaningful product wins yet.

---

## Architecture decision

### 1. Separate ranking service

Create a dedicated internal ranking service.

Responsibilities:

- hydrate compact request context
  - viewer graph, recent interaction context, experiment/version info
- generate `For You` candidates from multiple sources
- assign candidate metadata such as `sourceBucket` and `networkClass`
- run pre-scoring filters
  - duplicate removal, repost/original dedup, self-post suppression, age cutoffs, social-graph filters
- score candidates
- apply reranking / diversity constraints
  - especially author diversity, reply control, and bucket saturation limits
- run post-selection checks before returning IDs
- manage ranked pagination sessions
- run non-critical side effects such as caching/request logging
- return ranked post IDs, cursor, algorithm version, and experiment variant

This service should be isolated from the main API so that slow ranking work cannot degrade:

- post creation
- post reads
- notifications
- profile routes
- other core app traffic

### 2. Client-facing API remains the hydration layer

The client-facing API layer should continue to own:

- auth / session handling
- client-facing endpoint contracts
- post DTO generation
- media loading
- repost / quote / reply-parent hydration
- viewer flags
- final response shaping
- final safety filtering before response

Recommended request flow:

1. Client requests the `For You` feed
2. Client-facing API authenticates the user
3. Client-facing API computes `variant` and `algoVersion` using shared logic
4. Client-facing API checks first-page cache when eligible
5. Client-facing API calls the internal ranking service
6. Ranker returns ordered post IDs plus cursor and algorithm metadata
7. Client-facing API hydrates those posts using the normal post rendering pipeline
8. Client-facing API re-checks visibility / mute / block / deletion constraints
9. Client-facing API returns the final feed response

This keeps ranking isolated while avoiding duplication of all post rendering logic.

### 3. Shared feed eligibility / filter helpers

Do not duplicate feed safety logic by hand across services.

Extract shared helpers for rules such as:

- `deletedAt is null`
- public visibility requirements
- block relationships
- feed mutes
- viewer-specific exclusions

The ranker should use these helpers during candidate generation, and the API should still perform a final safety check before returning hydrated results.

Without this, the ranker and API will drift and create:

- short pages
- hard-to-debug dropped IDs
- inconsistent visibility behavior across feeds

### 4. Internal pipeline pattern

One idea worth borrowing from larger feed systems is the **serving architecture shape**, not the full ML stack.

The ranker should be organized internally as a pipeline with stages such as:

1. query context hydration
2. candidate sources
3. candidate hydrators
4. pre-scoring filters
5. scorers / rerankers
6. selector
7. post-selection checks
8. side effects

This is useful because it:

- keeps business logic composable
- lets independent sources/hydrators run in parallel where useful
- makes it easier to reason about failures per stage
- gives a clean place to add or remove heuristics later

We should borrow that structure, but **not** copy the heavy ML/retrieval stack 1:1.

---

## Language choice

### Use TypeScript for v1

Use the existing stack for the ranker service.

Reasons:

- fastest implementation speed
- easiest sharing of contracts/helpers with the current API
- easiest experimentation with multiple formulas
- lowest organizational overhead for the current team
- candidate counts are small enough that TypeScript performance should be fine

### Do not use Go yet

Go may become useful later if the ranker becomes:

- significantly CPU-bound
- much higher QPS
- much larger candidate sets
- embedding / ANN / retrieval heavy
- a specialized infrastructure service with tighter p95/p99 goals

But for v1, Go is premature.

---

## Feature storage strategy

Do **not** introduce a full feature store, vector DB, or warehouse-backed online ranking path yet.

### Primary source of truth: Postgres

Use Postgres tables and joins for core data such as:

- follows
- likes
- reposts
- replies
- blocks / mutes
- post metadata
- post age
- author relationships

### Prefer a small number of precomputed aggregates when they pay for themselves

Useful examples, once justified:

#### `user_author_affinity`
Tracks how much a user tends to engage with an author.

Possible fields:

- `user_id`
- `author_id`
- `affinity_score`
- `last_interaction_at`
- optional counters for likes/replies/reposts/clicks

#### `post_engagement_velocity`
Tracks recent normalized engagement on a post.

Possible fields:

- `post_id`
- `like_count_30m`
- `reply_count_30m`
- `repost_count_30m`
- `engagement_score_1h`
- `engagement_score_6h`
- `updated_at`

#### Later, if needed: `user_topic_affinity`
Tracks affinity to hashtags, keywords, or topic clusters.

Possible fields:

- `user_id`
- `topic_key`
- `score`
- `updated_at`

### Launch shortcut if aggregates are not ready yet

If aggregate tables are not ready for launch, that should **not** block v1.

A good interim approach is:

- fetch the candidate pool from existing tables
- for the final candidate set only, compute small recent-window counts on demand
- e.g. likes/reposts/replies in the last `30m` / `6h`

This gives the ranker a basic freshness / velocity signal without committing to a full feature pipeline on day one.

### Redis usage

Redis should be optional and narrow.

Recommended use:

- cache first-page ranked results
- store short-lived ranked pagination sessions
- cache short-lived candidate buckets if needed
- avoid turning Redis into the primary feature source unless proven necessary

This keeps RAM usage and operational complexity lower.

---

## Initial ranking approach

Start with a **heuristic ranker**.

### Query context hydration

Before sourcing candidates, hydrate a compact request context with things like:

- viewer follow/block/mute state
- recent interaction history
- top affinity authors or recent action aggregates
- experiment `variant` and `algoVersion`
- ranked-session state when paginating

This keeps sources, filters, and scorers from each reloading the same viewer information independently.

### Candidate sources

Initial `For You` candidates can come from a blend of:

- posts liked by people the user follows
- posts reposted by people the user follows
- fresh public original posts and quote posts
- posts from authors the user historically engages with
- optional trending posts later

Each candidate should carry both:

- a `sourceBucket` for debugging / analysis
- a `networkClass` such as `following`, `adjacent`, or `discovery`

The exact label set can stay small in v1, but keeping this distinction explicit is useful for scoring, policy, and analytics.

### Candidate eligibility rules

Be explicit about what is and is not a direct candidate:

- filter blocked/muted content
- exclude deleted content
- require public visibility for discovery buckets
- treat repost rows primarily as **signals**, not as direct candidates
- exclude or heavily penalize low-signal replies
- if affinity buckets include followed authors, cap their share so `For You` does not collapse into a shuffled `Following` feed

### Pre-scoring filters

Before scoring, apply cheap/high-value filters such as:

- exact duplicate removal
- repost/original deduplication
- self-post filtering when appropriate
- age limits
- block/mute filtering
- optional muted-keyword filtering later
- optional seen/served suppression

A key distinction worth keeping is:

- **served** = we already placed this content into the current ranked session / pagination flow
- **seen** = the user likely already encountered the content recently

These are related but not identical, and should not be collapsed into one concept.

### Features for scoring

Use lightweight features such as:

- recency
- network proof
  - how many follows liked/reposted the post
- author affinity
  - how much the viewer historically engages with the author
- recent engagement / freshness signal
  - preferably recent-window counts or a light velocity score
- network class / source bucket
- optional light topic match later

### Scoring and reranking

The scoring system should remain heuristic for v1, but it should still be **multi-objective** rather than pretending there is one magical relevance number.

In practice, combine signals for things like:

- engagement likelihood
- network validation
- freshness
- discovery value
- low-quality reply penalty
- later, negative-feedback risk if we capture it cleanly

Apply reranking rules such as:

- reduce repeated authors
- avoid stale posts dominating
- cap oversaturation from one source/bucket
- preserve some freshness in the first screen
- preserve some discovery if followed authors are allowed in the pool

One especially useful mechanism is **author diversity attenuation**:

- do not only hard-cap repeated authors
- also progressively decay the score of later posts from the same author within the same ranked set

That usually gives a better result than binary allow/disallow rules alone.

### Post-selection checks

After selection, run one more lightweight pass for:

- final visibility/safety checks
- conversation/thread dedup where needed
- any route-level exclusions that are cheaper to enforce late

This gives us two helpful layers:

- pre-scoring filters to avoid wasting work
- post-selection checks to protect final response quality

---

## Failure isolation and fallbacks

This is a hard requirement.

### Rules

- the main API must use a **strict timeout** when calling the ranker
- if the ranker is slow or unavailable on **page 1**, the user should still get a feed
- ranking failures must not consume enough resources to degrade core endpoints
- if a ranked pagination session is missing/expired on **page 2+**, do **not** silently switch to another feed family mid-scroll

### Recommended behavior

- ranker timeout budget: roughly **100–150ms**
- if page-1 timeout/failure happens:
  - fall back to a simpler feed strategy
  - e.g. a network-based blend
  - or public chronological feed as last resort
- if a cursor references a missing/expired ranked session:
  - return a restart-required signal
  - let the client refresh from page 1 rather than mixing ranking modes

### Infra isolation

Use:

- separate deployment/container for ranker
- separate resource limits
- separate DB pool limits from the main API

That ensures ranking load cannot starve the core app.

---

## Experimentation strategy

We want multiple formulas and fast debugging when users report that the algorithm feels great or bad.

### Deterministic bucketing must be shared

Assign users to variants deterministically using something like:

- `hash(userId + experimentName)`

Example variants:

- `for_you_v1_a`
- `for_you_v1_b`

Important detail:

- the bucketing helper and the `algoVersion` constant should live in shared code imported by **both** API and ranker
- this lets the API know the variant **before** cache lookup
- this keeps cache keys, logging, and ranker behavior aligned

### Include markers everywhere

Each ranked response should include:

- `algoVersion`
- `variant`

These markers should also be logged on:

- impressions
- likes
- reposts
- replies
- hides
- reports

That lets us quickly tie user sentiment and observed metrics to a specific ranking formula.

---

## Analytics attribution

If we want to evaluate ranking quality, impression markers alone are not enough.

For `For You`, analytics should carry feed context on both:

- impressions
- downstream engagement events

Recommended metadata:

- `surface: "for_you"`
- `algoVersion`
- `variant`
- `position`
- optional `sourceBucket` only if the response actually exposes per-item bucket context

Existing product analytics calls can continue, but ranking evaluation should rely on feed-context-aware events stored with durable metadata.

---

## Caching and pagination

Cache conservatively.

### First page cache

Cache only the first page of `For You`.

Suggested TTL:

- **30–60 seconds**

Cache key should include:

- `userId`
- `variant`
- `algoVersion`

### Ranked session cache

For ranked pagination, use Redis-backed sessions.

Store at least:

- `userId`
- `postIds`
- `algoVersion`
- `variant`
- `snapshotAt`

TTL:

- roughly **5–10 minutes**

Cursor payload should remain opaque, but logically encode:

- `sessionId`
- `offset`

This stabilizes pagination and prevents score drift across pages.

---

## What not to build yet

Avoid overbuilding v1.

Do not introduce yet:

- Go-based ranking service
- full ML ranking pipeline
- feature store
- vector DB
- ANN retrieval service
- Thunder-like realtime ingestion / in-memory candidate service
- large explainability system
- per-user/per-post online feature tables unless profiling clearly justifies them

These can come later if usage and ranking complexity justify them.

---

## Upgrade path

### Phase 1
- ship heuristic ranking in the dedicated ranking service
- structure it as a pipeline with query hydration, sources, filters, scorers/rerankers, post-selection checks, and side effects
- extract shared eligibility/filter helpers
- add semantic dedup, author diversity attenuation, and explicit network-class labeling
- use existing Postgres tables plus light recent-window freshness signals
- add caching, timeout, fallback, and variant markers

### Phase 2
- add targeted aggregate tables where they clearly improve quality/latency
- improve author/topic affinity
- add better seen-content suppression if it proves valuable
- compare multiple formulas via experiments

### Phase 3
- add ML ranking if data quality and scale justify it
- possibly add embeddings / retrieval if recall becomes the bottleneck
- consider a faster dedicated in-network retrieval layer only if feed reads actually demand it

### Phase 4
- revisit runtime choice only if profiling shows the ranker is truly constrained by CPU/runtime behavior

---

## Bottom line

The first `For You` system should be:

- **TypeScript**
- **a separate internal ranking service**
- **structured internally as a composable pipeline**
- **backed primarily by Postgres, with small aggregate tables added only as needed**
- **supported by short-lived page-0 cache plus Redis ranking sessions**
- **using semantic dedup, explicit network-class labels, and author-diversity attenuation**
- **protected by strict timeouts, graceful page-1 fallback, and restart-required semantics for expired ranked cursors**
- **kept consistent through shared bucketing/version helpers and shared feed safety filters**
- **ready for experimentation through deterministic traffic splitting and feed-context-aware analytics markers**

This gives us the right balance of:

- speed of shipping
- safety for core endpoints
- low-to-moderate ops complexity
- cheap iteration on ranking logic
- a clean path to evolve later if scale demands it
