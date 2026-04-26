# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Twotter — a Twitter-like social platform. Turborepo monorepo with three apps and shared packages, all TypeScript, using Bun as the runtime and package manager.

## Commands

```bash
bun install                  # Install all dependencies
bun run dev                  # Start all apps (web :3000, api :3001, worker)
bun run build                # Build all apps
bun run typecheck            # Type-check all packages
bun run lint                 # Lint all packages
bun run lint:fix             # Auto-fix lint issues
bun run format               # Format with Prettier

# Database
bun run db:push              # Push Drizzle schema to Postgres
bun run db:studio            # Open Drizzle Studio

# Infrastructure (Docker: Postgres, Redis, MinIO, Mailpit)
bun run services:up          # Start local services
bun run services:down        # Stop local services

# Run a single app directly
bun run --env-file=../../.env --watch src/index.ts   # from apps/api or apps/worker
cd apps/web && bun run dev                            # Vite dev server
```

## Architecture

### Apps

- **`apps/web`** — TanStack Start (React 19 + TanStack Router + Vite). File-based routing in `src/routes/`. API calls go through the typed client in `src/lib/api.ts`. Uses Lexical for rich-text editing, Motion for animations, Phosphor icons.
- **`apps/api`** — Hono HTTP server on Bun (port 3001). Routes mounted under `/api/*` in `src/index.ts`. Each route file is a self-contained Hono sub-app in `src/routes/`. The `AppContext` singleton (`src/lib/context.ts`) holds db, auth, mailer, S3, pg-boss, cache, pubsub, logger, and rate limiter — initialized once at boot and closed over by route handlers.
- **`apps/worker`** — pg-boss job processor. Handles `email.send`, `media.process`, `github.unfurl`, and scheduled post publishing. Shares packages with the API but runs as a separate process.

### Packages

| Package | Purpose |
|---|---|
| `@workspace/db` | Drizzle ORM schema + client (postgres-js driver, snake_case) |
| `@workspace/auth` | better-auth config (email/password, OAuth, magic link, 2FA, admin plugin) |
| `@workspace/ui` | shadcn/ui component library + Tailwind v4 |
| `@workspace/types` | Shared TypeScript types inferred from DB schema |
| `@workspace/validators` | Zod schemas for input validation |
| `@workspace/email` | React Email templates + Resend/SMTP |
| `@workspace/media` | S3 (MinIO locally) media processing with Sharp, blurhash |
| `@workspace/rate-limit` | Redis-based rate limiting (ioredis) |
| `@workspace/github-unfurl` | GitHub URL rich card fetcher via Octokit |

### Key Patterns

- **Auth**: better-auth with Drizzle adapter. Session middleware in `apps/api/src/middleware/session.ts` attaches user to Hono context. Role-based access: `user`, `admin`, `owner`.
- **API routes**: Each route file exports a Hono instance. Auth-gated endpoints use `requireAuth`/`requireAdmin` from session middleware. Rate limits applied per-bucket via Redis.
- **Job queue**: API enqueues work with `boss.send()`, worker processes with `boss.work()`. Queue names: `email.send`, `media.process`, `github.unfurl`.
- **Media**: Uploads go to S3 (MinIO locally). The API has a signing proxy at `/api/m/*` that mints short-lived signed URLs and 302-redirects.
- **Real-time**: DMs use SSE via Redis PubSub (`apps/api/src/lib/pubsub.ts`).
- **Federation**: ActivityPub routes mounted at root (`/` not `/api`) for spec compliance (`.well-known/webfinger`, `/users/:handle`).
- **ETag caching**: Weak ETags on read-heavy GET endpoints (feed, posts, users, notifications).
- **Frontend routing**: TanStack Router with file-based route generation. Route files in `apps/web/src/routes/`.

## Code Style

- TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`
- Prettier: 80-char lines, ES5 trailing commas, Tailwind CSS plugin (auto-sorts utilities)
- ESLint: `@tanstack/eslint-config`
- Database columns use snake_case; TypeScript uses camelCase (Drizzle handles mapping)

## CI

GitHub Actions runs `typecheck`, `lint`, and `build` on PRs and pushes to main.
