import { RESEND_COOLDOWN_SEC } from '@workspace/validators/auth'
import type { FixedWindowLimit } from './index.ts'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// Bucket caps. Edit these directly to tune; review surfaces every change.
export const BUCKETS = {
  'posts.create': [
    { windowMs: MIN, max: 10 },
    { windowMs: HOUR, max: 60 },
    { windowMs: DAY, max: 600 },
  ],
  'posts.reply': [
    { windowMs: MIN, max: 30 },
    { windowMs: DAY, max: 2000 },
  ],
  'posts.like': [
    { windowMs: MIN, max: 120 },
    { windowMs: DAY, max: 3000 },
  ],
  'posts.bookmark': [{ windowMs: DAY, max: 2000 }],
  'posts.repost': [
    { windowMs: MIN, max: 60 },
    { windowMs: DAY, max: 1000 },
  ],
  'posts.edit': [
    { windowMs: MIN, max: 10 },
    { windowMs: DAY, max: 200 },
  ],
  // Pin/unpin churn — cheap on the DB but worth bounding.
  'posts.pin': [{ windowMs: MIN, max: 30 }],
  // Twitter-standard anti-spam cap on follows.
  'users.follow': [{ windowMs: DAY, max: 400 }],
  'users.block': [{ windowMs: DAY, max: 100 }],
  'users.mute': [{ windowMs: DAY, max: 100 }],
  'media.upload': [{ windowMs: HOUR, max: 60 }],
  // Analytics pings are batched client-side. Generous cap for legitimate scrollers.
  'analytics.ingest': [{ windowMs: MIN, max: 120 }],
  'dms.send': [
    { windowMs: MIN, max: 60 },
    { windowMs: DAY, max: 2000 },
  ],
  'dms.start': [{ windowMs: HOUR, max: 30 }],
  // Typing pings are debounced client-side to ~one per 3s; this cap is generous.
  'dms.typing': [{ windowMs: MIN, max: 60 }],
  'dms.react': [{ windowMs: MIN, max: 120 }],
  // Group admin actions on a DM conversation (rename, add/remove members).
  'dms.members': [
    { windowMs: MIN, max: 60 },
    { windowMs: DAY, max: 500 },
  ],
  // Group invite-link create/revoke.
  'dms.invites': [{ windowMs: HOUR, max: 30 }],
  // Accept / decline a DM request — bounds churn but allows quick triage.
  'dms.respond': [{ windowMs: MIN, max: 120 }],
  // Edit / delete an own message — bounded to limit notification churn.
  'dms.message-mutate': [
    { windowMs: MIN, max: 60 },
    { windowMs: DAY, max: 500 },
  ],
  // Reports are extremely abuse-prone (mass-report harassment) — keep tight.
  'reports.create': [
    { windowMs: HOUR, max: 10 },
    { windowMs: DAY, max: 30 },
  ],
  // Account creation. Tight per-IP cap to make spam signups expensive without breaking
  // legitimate household/coworker shared-IP signups.
  'auth.signup': [
    { windowMs: HOUR, max: 5 },
    { windowMs: DAY, max: 20 },
  ],
  // Login attempts — guard against credential stuffing / brute force.
  'auth.signin': [
    { windowMs: MIN, max: 10 },
    { windowMs: HOUR, max: 60 },
  ],
  // Magic-link send. IP-keyed (no session yet) — closes email-bombing of a target inbox.
  'auth.magic-link': [{ windowMs: HOUR, max: 10 }],
  // Password reset request — same email-bomb vector as magic-link.
  'auth.password-reset': [{ windowMs: HOUR, max: 10 }],
  // 2FA verification — guards TOTP / backup-code brute force.
  'auth.2fa-verify': [
    { windowMs: MIN, max: 10 },
    { windowMs: HOUR, max: 60 },
  ],
  // Verification email resend — prevents using our SMTP relay to bomb a target inbox.
  // Fixed-window: at most 1 send per 90s window; worst case is ~2 sends straddling a
  // window boundary. The verify-email screen mirrors the same cooldown client-side via
  // the shared RESEND_COOLDOWN_SEC, so realistic abuse requires bypassing the UI.
  'auth.email-verify-resend': [{ windowMs: RESEND_COOLDOWN_SEC * 1000, max: 1 }],
  // OAuth callback — IP-keyed cap against bot-driven account creation via OAuth providers.
  'auth.oauth-callback': [{ windowMs: MIN, max: 60 }],
  // Handle claim — irreversible. Tight cap to make handle-squatting scripts expensive.
  'me.handle-claim': [{ windowMs: HOUR, max: 5 }],
  // Profile updates — bounded to limit bio-spam churn.
  'me.update': [{ windowMs: HOUR, max: 60 }],
  // Invite-token accept — guards against brute-forcing invite tokens to crash private DMs.
  'invites.accept': [
    { windowMs: MIN, max: 30 },
    { windowMs: DAY, max: 100 },
  ],
  // Poll voting.
  'polls.vote': [
    { windowMs: MIN, max: 120 },
    { windowMs: DAY, max: 500 },
  ],
  // List CRUD — bounded to prevent list-spam and harassment-list creation.
  'lists.write': [
    { windowMs: HOUR, max: 30 },
    { windowMs: DAY, max: 100 },
  ],
  // Adding/removing list members — generous since lists can be large.
  'lists.members': [
    { windowMs: MIN, max: 200 },
    { windowMs: DAY, max: 1000 },
  ],
  // Notification mark-read writes — bounded against runaway clients.
  'notifications.write': [{ windowMs: MIN, max: 120 }],
  // Scheduled-post create / edit / delete / publish. Day cap caps the worst-case publish flood.
  'scheduled.write': [
    { windowMs: HOUR, max: 30 },
    { windowMs: DAY, max: 200 },
  ],
  'articles.write': [
    { windowMs: HOUR, max: 20 },
    { windowMs: DAY, max: 100 },
  ],
  // Read-side caps. These are loose by design — legitimate users on a hot feed can scroll
  // fast — but they cap the upside for a misbehaving client / scraper / runaway loop. Page-0
  // hits are cached, so the per-minute cap mostly bounds back-end work for cursor-paginated
  // requests and uncached endpoints (search, thread).
  'reads.feed': [{ windowMs: MIN, max: 240 }],
  'reads.profile': [{ windowMs: MIN, max: 480 }],
  // Search hits two table scans (users ilike + posts FTS); cap tighter than feed/profile.
  'reads.search': [{ windowMs: MIN, max: 60 }],
  // Thread expands ancestors + replies + viewer flags.
  'reads.thread': [{ windowMs: MIN, max: 240 }],
  // Notification polling — frontend may poll unread-count every few seconds. Cache makes
  // this ~free, but keep a hard ceiling against runaway tabs / misbehaving SDKs.
  'reads.notifications': [{ windowMs: MIN, max: 480 }],

  // GitHub connector — start, callback, manual refresh. Tight per-user caps because each
  // call burns GitHub's 5k/hr token budget; misbehaving tabs shouldn't be able to drain it.
  'connectors.github.start': [{ windowMs: MIN, max: 6 }],
  'connectors.github.callback': [{ windowMs: MIN, max: 30 }],
  'connectors.github.refresh': [
    { windowMs: MIN, max: 4 },
    { windowMs: HOUR, max: 30 },
  ],
} satisfies Record<string, Array<FixedWindowLimit>>

export type BucketName = keyof typeof BUCKETS
