# twitbruv

Social / microblogging web app. This repository is internally referred to as **twotter**.

AGPL-3.0. Bun + Turbo monorepo.

## What’s in the box

- **Web** — TanStack Start, React 19, Vite, TanStack Router and Query, Tailwind v4, shadcn-style UI in `packages/ui`.
- **API** — Bun and Hono, Better Auth, pg-boss, pino.
- **Worker** — Bun background jobs (queues, email, unfurl, etc.).
- **Feed ranker** — Bun and Hono service for “For You” ranking.
- **Mobile** — Native iOS (Swift / Xcode) under `apps/mobile`.
- **Docs** — Cabinet docs for the shared UI library (`docs/`, `bun run docs`).
- **Data** — Postgres (Drizzle), Redis, S3-compatible storage (MinIO locally).

See [LICENSE](LICENSE).

## Repository layout

**Apps** (`apps/`):

- `web` — browser app
- `api` — HTTP API
- `worker` — background workers
- `feed-ranker` — ranking service
- `mobile` — iOS app

**Packages** (`packages/`):

- `db`, `auth`, `ui`, `rate-limit`, `validators`, `media`, `email`
- `github-unfurl`, `youtube-unfurl`, `url-unfurl-core`, `x-unfurl`, `activitypub`
- `types`, `config-eslint`, `config-tsconfig`

Agent-oriented detail lives in [AGENTS.md](AGENTS.md).

## Prerequisites

- [Bun](https://bun.sh) 1.3.13+ (see `packageManager` in [package.json](package.json))
- Node 20+ (see `engines` in [package.json](package.json))
- [Docker](https://docs.docker.com/get-docker/) (for local Postgres, Redis, MinIO via [docker-compose.yml](docker-compose.yml))
- Xcode 15+ only if you work on `apps/mobile`

## Quick start

```bash
bun install
cp .env.example .env
bun run services:up
bun run db:push
bun run db:seed
bun run dev
```

**Where things listen (default local):**

- Web — http://localhost:3000
- API — http://localhost:3001
- UI docs (Cabinet) — http://localhost:4000
- Postgres — `5432`
- Redis — `6379`
- MinIO API — `9000`
- MinIO console — `9001`

## Running one app at a time

`bun run dev` starts every package that defines a Turbo `dev` task. To run a single workspace:

```bash
bun run --filter web dev
bun run --filter api dev
bun run --filter worker dev
bun run --filter feed-ranker dev
```

Docs only:

```bash
bun run docs
```

**Mobile:** open [apps/mobile/twitbruv.xcodeproj](apps/mobile/twitbruv.xcodeproj) in Xcode and run on a simulator. Point the app at your API using the same base URL as in `.env` (for example `BETTER_AUTH_URL` and the web client’s `VITE_PUBLIC_API_URL`; default API in [.env.example](.env.example) is http://localhost:3001).

## Environment variables

- Copy [.env.example](.env.example) to `.env` and adjust. It is the source of truth for variable names.
- Only names starting with `VITE_` are exposed to the web client.
- Do not commit `.env` or paste secrets into issues, PRs, or chat.
- Local defaults are enough for many flows; OAuth providers, Resend, Databuddy, Turnstile, APNs, GitHub unfurl token, and similar integrations are optional until you need them.

## Common commands

From the repo root ([package.json](package.json)):

- `bun run dev` — all Turbo `dev` tasks
- `bun run build` — production build
- `bun run typecheck` — TypeScript across workspaces
- `bun run lint` / `bun run lint:fix` — ESLint
- `bun run format:check` / `bun run format` — Prettier
- `bun run db:push` — apply Drizzle schema to the database in `DATABASE_URL`
- `bun run db:seed` — seed data
- `bun run db:studio` — Drizzle Studio
- `bun run services:up` / `bun run services:down` — Docker services in [docker-compose.yml](docker-compose.yml)
- `bun run docs` — Cabinet dev server
- `bun run docs:build` — static docs build

## Database

- Schema — `packages/db/src/schema`
- Do **not** add generated SQL migrations in this repo; sync locally with `bun run db:push` when your `DATABASE_URL` is a database you are allowed to change.
- Ask maintainers before running `db:push` against shared, preview, staging, or production databases.

## Contributing

- Read [AGENTS.md](AGENTS.md) first (Bun-only, boundaries, security, and what not to edit by hand).
- Use [.github/pull_request_template.md](.github/pull_request_template.md) and explain why the change exists, not only what changed.
- Presentation shared across the app belongs in `packages/ui` with thin wiring in `apps/web` when behavior is app-specific.
- Avoid new comments unless they document non-obvious intent or constraints.
- CI on `main` and PRs: typecheck, format check, lint, build (see [.github/workflows/ci.yml](.github/workflows/ci.yml)). Before opening a PR, run:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

## License

[GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, AGPL obligations apply.
