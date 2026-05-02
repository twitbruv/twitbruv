# AGENTS.md

Guidance for Claude, Codex, Cursor, and any coding agent working in this
repository.

## First principles

- Use Bun. Do not switch package managers or introduce `npm`, `pnpm`, or `yarn`
  lockfiles.
- Preserve existing behavior unless the task explicitly asks for a behavior
  change.
- Make the smallest coherent change that solves the task.
- Do not commit, push, amend, rebase, or create PRs unless explicitly asked.
- Do not read, print, or expose secrets from `.env` or provider dashboards.
- Do not generate migrations.
- Ask validating questions when requirements are ambiguous, risky, or likely to
  affect data, auth, billing, production behavior, or public APIs.

## Project map

This is a Bun + Turbo monorepo.

- `apps/web`: TanStack Start / React 19 web app, Vite, TanStack Router,
  TanStack Query, Tailwind CSS v4, shadcn-style UI composition.
- `apps/api`: Bun + Hono API. Routes live in `apps/api/src/routes`, shared API
  helpers in `apps/api/src/lib`, session/origin middleware in
  `apps/api/src/middleware`.
- `apps/worker`: Bun worker process for background jobs.
- `apps/mobile`: Native iOS SwiftUI client (`twitbruv` Xcode project). Cookie sessions via
  Better Auth, talks to `apps/api` over HTTPS. Built with Xcode 26+, iOS 26.4 deployment
  target. Not part of the Bun/Turbo build graph.
- `apps/docs`: Cabinet docs playground/content.
- `packages/db`: Drizzle schema, database client, seed/studio scripts.
- `packages/auth`: Better Auth server/client integration.
- `packages/ui`: Shared React UI components, hooks, utils, and global styles.
- `packages/rate-limit`: Rate-limit buckets and helpers.
- `packages/validators`: Shared Zod validation contracts.
- `packages/media`: S3-compatible media helpers.
- `packages/email`: Email rendering/sending helpers.
- `packages/github-unfurl`, `packages/youtube-unfurl`,
  `packages/url-unfurl-core`: URL card/unfurl logic.
- `packages/types`: Shared TypeScript types.
- `packages/config-*`: Shared TypeScript and ESLint configuration.

## Commands

Run commands from the repository root unless a task clearly requires a package
directory.

- Install dependencies: `bun install`
- Start all dev tasks: `bun run dev`
- Start local services: `bun run services:up`
- Stop local services: `bun run services:down`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`
- Fix lint: `bun run lint:fix`
- Check formatting: `bun run format:check`
- Format: `bun run format`
- Build: `bun run build`
- Database push for local schema sync: `bun run db:push`
- Database seed: `bun run db:seed`
- Database studio: `bun run db:studio`

Before finishing a code task, run the same gates as CI unless the user asked for
a narrower change or the environment cannot support it:

1. `bun run typecheck`
2. `bun run lint`
3. `bun run format:check`
4. `bun run build`

If a gate is skipped or fails for a pre-existing/environmental reason, report it
clearly.

## Local services

`bun run services:up` starts:

- Postgres on `5432`
- Redis on `6379`
- MinIO API on `9000`
- MinIO console on `9001`

Use `.env.example` as the source of truth for local variable names and defaults.

## Style

- TypeScript first. Keep types explicit at boundaries and avoid `any` unless
  there is no practical alternative.
- Formatting is Prettier-controlled: LF endings, no semicolons, double quotes,
  2-space indentation, trailing commas where Prettier wants them, 80-column
  print width.
- Prefer clear names and small functions over clever abstractions.
- Keep imports using workspace packages when shared code already exists.
- Avoid comments by default. Add comments only for non-obvious intent,
  trade-offs, operational constraints, or security-sensitive decisions.
- Do not add comments that merely narrate code.
- Follow existing file-local conventions over global preferences when they
  differ.

## React and web app

- `apps/web` uses TanStack Router. Route files live in `apps/web/src/routes`.
- Do not hand-edit `apps/web/src/routeTree.gen.ts`; it is generated.
- API client code lives in `apps/web/src/lib/api.ts`.
- Query keys and query helpers live in `apps/web/src/lib/query-keys.ts`,
  `apps/web/src/lib/query.tsx`, and related files.
- Keep server state in TanStack Query. Avoid duplicating server state in local
  React state.
- Use accessible markup for interactive UI: labels, keyboard support, focus
  states, and semantic elements.
- Keep browser-only APIs guarded so SSR/build paths do not crash.

## UI component library

- `packages/ui` is the single source of truth for all presentational UI
  components. Every component that is rendered in the app or documented should
  live here.
- Import shared UI from `@workspace/ui/components/...`,
  `@workspace/ui/hooks/...`, or `@workspace/ui/lib/...`.
- Global styles live in `packages/ui/src/styles/globals.css`.
- Components use Tailwind CSS v4 utility classes and the project's design tokens
  (e.g. `bg-base-1`, `text-primary`, `border-neutral`). Do not use hardcoded
  color values like `bg-white` — always use tokens so dark mode works.
- The configured icon library is Heroicons 16 (`@heroicons/react/16/solid`).
  Use the 16px solid variant as the default for all icons. Do not introduce
  other icon libraries.
- Prefer composing existing shared components before adding new ones.
- When a component needs app-specific behavior (e.g. routing, context hooks,
  API types), keep the presentational component in `packages/ui` with a plain
  props interface and create a thin wrapper in `apps/web` that maps app-specific
  data and wires up behavior.
- Documentation lives in `docs/content/components/` (MDX) with live examples in
  `docs/examples/`. Examples must import the real component from `@workspace/ui`
  — never hand-roll markup that duplicates a component's implementation.
- The docs site uses Cabinet Docs (`@cabinetdocs/cli`). Config is in
  `cabinet.config.ts`. Run with `bun run docs`.

## API, auth, and background jobs

- `apps/api/src/index.ts` wires middleware, auth, health checks, and route
  mounting.
- Add API routes under `apps/api/src/routes` and shared API logic under
  `apps/api/src/lib`.
- Keep request validation at API boundaries with Zod, preferably using shared
  schemas from `@workspace/validators` when applicable.
- Auth is Better Auth via `@workspace/auth`. Do not confuse it with NextAuth.
- Session and same-origin protections live in `apps/api/src/middleware/session.ts`.
- Rate limits are a cross-cutting requirement for abusable endpoints. Check
  `packages/rate-limit/src/limits.ts` before adding auth, write, upload,
  search, invite, notification, or connector flows.
- Logging uses pino. Do not log secrets, tokens, passwords, cookies, auth
  headers, OAuth codes, or raw private message content.
- Worker jobs live in `apps/worker/src/jobs`.

## Database

- Drizzle schemas live in `packages/db/src/schema`.
- Do not generate migrations or add SQL migration files.
- Do not run `drizzle-kit generate`.
- For schema changes, edit the schema files and use `bun run db:push` only for
  local schema synchronization. Ask before running it against any shared,
  preview, staging, or production database.
- Be conservative with destructive schema changes. Call out data-loss risks
  before editing.
- Keep schema exports wired through `packages/db/src/schema/index.ts` when
  adding schema modules.

## Environment and secrets

- `.env` is local and must not be committed or displayed.
- Add new variable names and safe example values to `.env.example`.
- Only `VITE_*` variables are exposed to the web client.
- Treat all tokens, secrets, API keys, OAuth credentials, cookies, and database
  URLs as sensitive.
- Never paste secret values into logs, test output, commit messages, PR
  descriptions, docs, or chat responses.

## Generated and sensitive files

Do not hand-edit or casually include these in changes:

- `bun.lock`, unless dependency changes require it.
- `apps/web/src/routeTree.gen.ts`.
- `packages/db/dist`.
- `dist`, `.output`, `.nitro`, `.tanstack`, `.vinxi`, `.turbo`.
- `*.tsbuildinfo`.
- `.env` and other local env files.
- `apps/api/scripts`, which is gitignored for local ad-hoc utilities.

## Git and PRs

- Keep commits focused when the user asks for commits.
- Match the repository's concise commit style. Conventional prefixes are fine
  when they clarify intent, but not required.
- Use the PR template in `.github/pull_request_template.md`.
- PR summaries should explain why the change exists, not just list files.
- Include the verification commands actually run.

## Adding dependencies

- Prefer existing workspace packages before adding new dependencies.
- Add dependencies with Bun so `package.json` and `bun.lock` stay consistent.
- Do not introduce duplicate libraries for concerns already covered in the repo
  without explaining the trade-off.

## Documentation

- Update docs or examples when a change affects setup, public behavior,
  component usage, environment variables, or agent workflows.
- Keep docs accurate to Bun commands, not pnpm/npm commands.
