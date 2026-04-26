import { Hono } from 'hono'
import { and, eq, inArray, schema, sql } from '@workspace/db'
import { pollVoteSchema } from '@workspace/validators'
import { handleRateLimitError } from '@workspace/rate-limit'
import { requireAuth, type HonoEnv } from '../middleware/session.ts'

export const pollsRoute = new Hono<HonoEnv>()

// Vote on a poll. Single-choice polls accept exactly one optionId; multi-choice polls accept up
// to one vote per option but only one POST per user (subsequent POSTs are rejected — no
// vote-changing in v1, matching Twitter behavior).
pollsRoute.post('/:pollId/vote', requireAuth(), async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  const pollId = c.req.param('pollId')
  await rateLimit(c, 'polls.vote')
  const body = pollVoteSchema.parse(await c.req.json())

  await db.transaction(async (tx) => {
    const [poll] = await tx
      .select({
        id: schema.polls.id,
        closesAt: schema.polls.closesAt,
        allowMultiple: schema.polls.allowMultiple,
      })
      .from(schema.polls)
      .where(eq(schema.polls.id, pollId))
      .limit(1)
    if (!poll) throw new HttpError(404, 'poll_not_found')
    if (poll.closesAt.getTime() <= Date.now()) throw new HttpError(409, 'poll_closed')

    if (!poll.allowMultiple && body.optionIds.length !== 1) {
      throw new HttpError(400, 'single_choice_poll')
    }

    const validOptions = await tx
      .select({ id: schema.pollOptions.id })
      .from(schema.pollOptions)
      .where(
        and(eq(schema.pollOptions.pollId, pollId), inArray(schema.pollOptions.id, body.optionIds)),
      )
    if (validOptions.length !== body.optionIds.length) {
      throw new HttpError(400, 'invalid_options')
    }

    // Already voted? Reject — votes are final.
    const existing = await tx
      .select({ optionId: schema.pollVotes.optionId })
      .from(schema.pollVotes)
      .where(and(eq(schema.pollVotes.pollId, pollId), eq(schema.pollVotes.userId, session.user.id)))
      .limit(1)
    if (existing.length > 0) throw new HttpError(409, 'already_voted')

    await tx.insert(schema.pollVotes).values(
      body.optionIds.map((optionId) => ({
        pollId,
        optionId,
        userId: session.user.id,
      })),
    )
    await tx
      .update(schema.pollOptions)
      .set({ voteCount: sql`${schema.pollOptions.voteCount} + 1` })
      .where(inArray(schema.pollOptions.id, body.optionIds))
  })

  c.get('ctx').track('poll_voted', session.user.id)
  return c.json({ ok: true })
})

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

pollsRoute.onError((err, c) => {
  const rl = handleRateLimitError(err, c)
  if (rl) return rl
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status as never)
  console.error(err)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})
