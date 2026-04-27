# Twitbruv `For You` Feed: Scoped Work Outline

This file is intentionally brief.

It exists only to show **how we scoped the work into implementation chunks**.
For full architecture, behavior, and file-level detail, see:

- `ALGO_PLAN.md`

---

## Why this doc exists

We do **not strictly need** a PR breakdown doc, but it helps keep the work:

- reviewable
- low-risk
- easy to stage
- easy to roll back

---

## Scope split

### 1. Shared ranking primitives

Create the shared pieces both API and ranker depend on:

- feed-policy helpers
- `algoVersion` / bucketing helpers
- ranker request/response contracts
- small shared ranking enums/types

Goal:
- prevent API/ranker drift from day one

### 2. Ranker service skeleton

Add `apps/feed-ranker` with the intended internal shape:

- query context hydration
- sources
- pre-filters
- scorers/rerankers
- post-selection checks
- side effects

Goal:
- land the service shape before filling in all ranking logic

### 3. Ranker logic

Implement the actual v1 ranker behavior:

- candidate sourcing
- semantic dedup
- served/seen handling
- heuristic scoring
- author diversity attenuation
- network-class-aware behavior
- Redis ranked-session cursors

Goal:
- make the internal ranker actually useful and stable

### 4. API integration

Add `GET /api/feed/for-you` in `apps/api` with:

- timeout to ranker
- page-0 cache
- hydration via existing DTO pipeline
- final safety filtering
- page-1 fallback
- page-2+ restart-required handling

Goal:
- expose the ranker safely without affecting core feeds

### 5. Web integration

Add the `For You` tab and wire it to the new API route.

Goal:
- ship the surface conservatively
- keep `Following` as the default tab initially

### 6. Analytics context

Add feed-context-aware analytics for:

- impressions
- engagements

Goal:
- make experiment results measurable by surface / variant / position

### 7. Post-launch tuning only if needed

After shipping, tune or extend only if data justifies it, e.g.:

- heuristic weights
- reply suppression
- affinity improvements
- small aggregate tables

Goal:
- avoid overbuilding before real usage proves the need

---

## Things explicitly out of scope for v1

- ML ranking
- vector retrieval
- feature store
- Go rewrite
- Thunder-like realtime candidate service

---

## Bottom line

The work is scoped into:

1. shared primitives
2. ranker skeleton
3. ranker logic
4. API route
5. web tab
6. analytics
7. tuning if needed

For the full rationale and implementation detail, use `ALGO_PLAN.md`.
