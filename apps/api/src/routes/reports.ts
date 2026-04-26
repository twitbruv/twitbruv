import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from '@workspace/db'
import { schema } from '@workspace/db'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'

export const reportsRoute = new Hono<HonoEnv>()

reportsRoute.use('*', requireHandle())

const reportSchema = z.object({
  subjectType: z.enum(['post', 'user', 'article', 'message']),
  subjectId: z.string().uuid(),
  reason: z.enum([
    'spam',
    'harassment',
    'csam',
    'violence',
    'impersonation',
    'illegal',
    'other',
  ]),
  details: z.string().trim().max(1000).optional(),
})

reportsRoute.post('/', async (c) => {
  const session = c.get('session')!
  const { db, rateLimit } = c.get('ctx')
  await rateLimit(c, 'reports.create')
  const body = reportSchema.parse(await c.req.json())

  // Idempotency: don't let a single user spam-stack reports against the same subject —
  // existing open report from this reporter is reused. Mods see the original details.
  const [existing] = await db
    .select({ id: schema.reports.id })
    .from(schema.reports)
    .where(
      and(
        eq(schema.reports.reporterId, session.user.id),
        eq(schema.reports.subjectType, body.subjectType),
        eq(schema.reports.subjectId, body.subjectId),
        eq(schema.reports.status, 'open'),
      ),
    )
    .limit(1)
  if (existing) return c.json({ id: existing.id, deduped: true })

  const [row] = await db
    .insert(schema.reports)
    .values({
      reporterId: session.user.id,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      reason: body.reason,
      details: body.details ?? null,
    })
    .returning({ id: schema.reports.id })
  c.get('ctx').track('content_reported', session.user.id, { subject_type: body.subjectType })
  return c.json({ id: row?.id ?? null, deduped: false })
})
