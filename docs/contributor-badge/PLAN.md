# Contributor Badge: Implementation Plan

A new fourth tier on the verified-badge system that recognizes GitHub
contributors to the project's repo(s). This plan is intentionally
**repository-specific** and references concrete files, columns, routes, and
tokens.

## Goal

Add a fourth badge tier — `contributor` — that:

- is granted automatically when a user connects GitHub (or hits **Refresh** in
  Settings → Connections) and is found in the contributors list of one of the
  configured project repos
- shows a **purple/fuchsia** check badge in the same places the verified badge
  appears today
- is awarded **even when `isVerified` is false**
- loses precedence to `admin` and `owner` (those tiers continue to win when
  both apply)
- is **wins over** plain `verified + user` (purple beats blue)
- can be granted/revoked manually by an admin/owner for non-GitHub contributors

## Tier precedence (highest → lowest)

When choosing what badge to render for a user, resolve in this order. The first
match wins; if no rule matches, render no badge.

| Priority | Condition                              | Badge color (token)         |
| -------- | -------------------------------------- | --------------------------- |
| 1        | `role === 'owner'` and `isVerified`    | gold (`badge-owner`)        |
| 2        | `role === 'admin'` and `isVerified`    | green (`badge-admin`)       |
| 3        | `isContributor` (regardless of others) | fuchsia (`badge-contributor`) |
| 4        | `isVerified`                           | blue (`badge-user`)         |
| —        | otherwise                              | none                        |

Notes:

- The user listed the tiers as 1) verified+user, 2) contributor, 3)
  verified+admin, 4) verified+owner. We render that as: admin/owner _outrank_
  contributor, and contributor outranks plain verified user.
- An admin/owner who is also a contributor keeps the admin/owner badge — no
  visual indication that they are also a contributor. If you want a secondary
  ring or pill in that case, that's a follow-up.
- `isVerified` does **not** gate the contributor badge. A user with no
  `isVerified` flag who contributes to the repo still gets the purple badge.

## Out of scope (explicitly)

- Background sweepers / cron jobs to revalidate contributor status. Status is
  refreshed only on explicit user actions (connect, refresh, disconnect) or
  admin override.
- Co-author / squash-merge attribution. We rely on whatever GitHub credits in
  `/repos/{owner}/{repo}/contributors`.
- Private contributions (would require `repo` scope on the connector OAuth
  app — privacy-invasive). Admin manual override is the escape hatch.
- A dedicated `user_contributions` join table. We start with a flag on `users`.
  If product needs grow (per-repo display, contribution counts in profile UI),
  promote to a child table later.
- OG card art changes beyond a color swap of the existing badge mark.

---

## File-level changes

### 1. Config and env

**`apps/api/src/lib/env.ts`**

- Add `GITHUB_CONTRIBUTOR_REPOS` to the env schema as an optional
  comma-separated `owner/repo` list (e.g. `twitbruv/twitbruv`). Parse into a
  validated `string[]` of `owner/repo` pairs. Empty/unset → contributor checks
  no-op.
- Document above the field that this is a public list (visible in code/repo
  config) and that it controls who is eligible for the contributor badge.

**`.env.example`**

- Add `GITHUB_CONTRIBUTOR_REPOS=` with a short comment.

We deliberately do **not** reuse `apps/api/src/routes/federation.ts`'s hardcoded
repo URL, because that field is metadata about the running software and might
not be the same as the contributor target.

### 2. Database

`packages/db/src/schema/auth.ts` — add to the `users` table next to
`isVerified` / `isBot`:

```ts
isContributor: boolean('is_contributor').notNull().default(false),
contributorCheckedAt: timestamp('contributor_checked_at', {
  withTimezone: true,
}),
```

- No migration is generated; schema sync lands via `bun run db:push` against
  local. Default `false` keeps existing rows correct.
- `contributorCheckedAt` is informational (last time we evaluated the user
  against GitHub). It's also useful for admin tooling and for "pretty
  freshness" in the connections section.

We keep this on `users` because every place that renders a badge already loads
the user row; a join would be wasteful for a single boolean.

### 3. Server: contributor lookup

New file `apps/api/src/lib/github-contributors.ts`:

- `getContributorLogins(env, repo: string): Promise<Set<string>>` — fetches
  `/repos/{owner}/{repo}/contributors?per_page=100` paginated until exhausted.
  Filters out `type === 'Bot'` and the literal `dependabot[bot]` style logins.
  Returns lowercased logins.
- `isUserContributor(env, login: string): Promise<boolean>` — iterates the
  configured repos, short-circuits as soon as `login` is found.
- Caches per-repo results in Redis under
  `github:contributors:{owner/repo}` with a 10-minute TTL. The cached value is
  the JSON-serialized array of logins. On miss, fetch + populate.
- Uses `GITHUB_UNFURL_TOKEN` via the existing client in
  `packages/github-unfurl/src/octokit.ts` (or a thin local fetch helper) for
  authenticated 5k/hr budget. Logs a single warning when unset and falls back
  to anonymous (60/hr).
- Catches network/HTTP errors and returns `false` (treat as "we don't know yet,
  don't grant the badge"). Never throws into the connector flow.

Why a per-repo cached set rather than per-user lookups:

- A `wave` of users hitting Refresh after a release will all hit the same
  contributor list. Caching once per repo is the cheapest correct strategy.
- Per-user `/users/:login/contributions-to-repos` doesn't exist; the cheapest
  truth is the contributors list itself.

### 4. Server: hook into the connector

`apps/api/src/routes/connectors/github.ts`:

- After `persistSnapshot(... { forceRefresh: true })` in **both**
  `GET /callback` and `POST /refresh`, call `isUserContributor(env, viewerLogin)`.
- Update the user row:

```ts
await ctx.db
  .update(schema.users)
  .set({
    isContributor: result,
    contributorCheckedAt: new Date(),
  })
  .where(eq(schema.users.id, session.user.id))
```

- On `DELETE /` (disconnect): set `isContributor = false` and
  `contributorCheckedAt = null` in the same transaction that deletes the
  connection row.
- Skip the lookup entirely when the user is a bot
  (`session.user.isBot === true`) or when no contributor repos are configured.
- No new rate-limit bucket. The check is gated by the existing
  `connectors.github.callback` and `connectors.github.refresh` buckets — the
  caller already burned a slot. The Redis cache prevents a thundering herd from
  reaching GitHub.

### 5. Server: admin override (recommended)

`apps/api/src/routes/admin.ts` — mirror the existing `/verify` and `/unverify`
endpoints:

- `POST /api/admin/users/:id/contributor` → set `isContributor = true` and a
  `contributorCheckedAt = now()`. Audit via `moderationActions` with action
  `contributor_grant`.
- `DELETE /api/admin/users/:id/contributor` → set `isContributor = false`.
  Audit `contributor_revoke`.
- Owner/admin gated like the verified endpoints.

`apps/web/src/components/admin/users.tsx` — add a toggle row to grant/revoke
contributor status, mirroring the verified toggle. Show the
`contributorCheckedAt` timestamp underneath if set.

This unblocks two real cases:

- Non-code contributors (designers, docs, translations) who deserve the badge.
- Manual testing without a real GitHub login.

### 6. DTO updates

Add `isContributor: boolean` to every payload that already carries
`isVerified` and `role`. Keeping it next to those fields keeps the response
shape obvious and grep-friendly.

API:

- `apps/api/src/routes/users.ts` — `publicUser()` and the
  `GET /api/users/:handle` response.
- `apps/api/src/routes/me.ts` — `toSelfDto`.
- `apps/api/src/lib/post-dto.ts` — the `author` shape used in feeds, posts,
  notifications.
- Notifications, DM, search, invite, and follower/following endpoints all pass
  through `publicUser()` already, so they pick this up for free; double-check
  each manually.

Web client types:

- `apps/web/src/lib/api.ts` — add `isContributor: boolean` to `PublicUser`,
  `PublicProfile`, `SelfUser`, and `Post.author`. All other shapes inherit.

### 7. UI: badge component

`packages/ui/src/components/verified-badge.tsx`:

- Extend `VerifiedBadgeRole` to
  `'user' | 'contributor' | 'admin' | 'owner'`.
- Add `contributor` entries to `roleColorClass` (`text-badge-contributor`) and
  `roleAriaLabel` (`'Contributor'`).
- Component API stays the same: `role` drives color and aria.

New helper, exported from `@workspace/ui/lib`:

```ts
export function resolveBadgeTier(input: {
  isVerified: boolean
  isContributor: boolean
  role: 'user' | 'admin' | 'owner'
}): VerifiedBadgeRole | null {
  if (input.role === 'owner' && input.isVerified) return 'owner'
  if (input.role === 'admin' && input.isVerified) return 'admin'
  if (input.isContributor) return 'contributor'
  if (input.isVerified) return 'user'
  return null
}
```

This single function is the only place tier precedence lives.

### 8. UI: call sites

Replace every existing `{u.isVerified && <VerifiedBadge ... role={u.role} />}`
with the resolved-tier pattern:

```tsx
const tier = resolveBadgeTier(u)
{tier ? <VerifiedBadge size={…} role={tier} /> : null}
```

Files to update (grep for `VerifiedBadge` and `isVerified`):

- `apps/web/src/routes/$handle.index.tsx` — profile header
- `apps/web/src/components/profile-hover-card.tsx` — name in hover
- `packages/ui/src/components/post-card.tsx` — shared post chrome (multiple)
- `apps/web/src/components/post-card.tsx` — quote/repost wrappers (multiple)
- `apps/web/src/components/user-list.tsx`
- `apps/web/src/routes/search.tsx`
- `apps/web/src/routes/inbox.*.tsx` (DMs)
- `apps/web/src/routes/notifications.tsx`
- `apps/web/src/routes/invite.$token.tsx`
- `apps/web/src/routes/$handle.a.$slug.tsx` (articles)
- `apps/web/src/components/admin/users.tsx`, `apps/web/src/components/admin/posts.tsx`
- `apps/web/src/components/settings/sections.tsx` (`PrivacyList`)
- `apps/web/src/routes/og.user.$handle.tsx`, `apps/web/src/routes/og.post.$id.tsx`

### 9. Theme tokens

`packages/ui/src/styles/theme.css`:

- In `@theme`, alongside `--color-badge-user|admin|owner`:

```css
--color-badge-contributor: oklch(0.62 0.27 330);
```

- In the dark overrides:

```css
--color-badge-contributor: oklch(0.7 0.24 330);
```

`oklch(0.62 0.27 330)` lands in vivid fuchsia/magenta with chroma comparable
to the existing badge colors. Tunable: shift hue toward `305` for more purple,
toward `350` for more pink. We'll eyeball it next to the others and adjust
once.

### 10. Settings → Connections UI

`apps/web/src/components/settings/sections.tsx` — `ConnectionsSection`:

- Read `isContributor` and `contributorCheckedAt` from `/api/me` (already
  loaded).
- Below the GitHub connection card, render a small status row:
  - When `isContributor === true`:
    "Contributor — recognized as a contributor to {repo}."
    rendered with the purple badge inline.
  - When `isContributor === false` and the user has a GitHub connection:
    "Not detected as a contributor to {repo} yet."
  - When the user has no GitHub connection: nothing.
- The existing **Refresh** button on the GitHub card already triggers
  `POST /api/connectors/github/refresh`; that path now also re-evaluates
  contributor status, so no new button is needed.

If there are multiple repos configured, render the count: "any of N repos".

---

## Risks and trade-offs

- **Private contributions are invisible.** Anyone who only contributes to
  private repos won't be picked up. Admin override mitigates.
- **Squash-merge attribution.** GitHub credits the squash author, not
  co-authors. People who only ever appear as `Co-authored-by:` won't show in
  `/contributors`. Admin override mitigates.
- **Cache freshness.** A new contributor merging today won't see the badge
  until the per-repo cache TTL elapses (10 min) **and** they hit Refresh. This
  is acceptable for a vanity badge.
- **Rename / handle changes.** We re-fetch `viewerLogin` from GitHub on every
  refresh. GitHub forwards renamed accounts to the new login, and the
  contributors endpoint reflects the current login. Should be robust.
- **Org expansion later.** If we want "any repo in the `twitbruv` org," the
  config shape (`string[]`) already accommodates listing repos. For "every
  repo in an org" we'd want a separate code path (list repos via API → fan out)
  with its own caching.

## Verification

- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run build`
  before the PR is taken out of draft.
- Manual flow:
  1. With `GITHUB_CONTRIBUTOR_REPOS` set, connect GitHub as a known contributor
     → purple badge appears on profile, hover card, post author lines.
  2. Connect as a non-contributor with `isVerified=false` → no badge.
  3. Connect as `isVerified=true` regular user who is also a contributor → purple
     wins over blue.
  4. As `admin`/`owner` who is also a contributor → admin/owner badge wins.
  5. Disconnect GitHub → contributor flag clears immediately, badge disappears.
  6. Admin grants contributor manually → badge appears without any GitHub
     connection. Admin revokes → badge disappears.
- A small unit test on `resolveBadgeTier` covering all eight `(isVerified,
  isContributor, role)` combinations would make refactors safe.

## Rollout

- Single PR, default branch off `main`.
- Behavior is gated on `GITHUB_CONTRIBUTOR_REPOS`. If unset, the field
  defaults to `false` for everyone and the UI doesn't change.
- After merge: set `GITHUB_CONTRIBUTOR_REPOS` in the API environment and have
  early contributors hit Refresh in Settings → Connections to light up.
