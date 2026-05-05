import { Hono } from 'hono'
import { and, eq, isNull, sql } from '@workspace/db'
import { schema } from '@workspace/db'
import { assetUrl } from '@workspace/media/s3'
import { requireHandle, type HonoEnv } from '../middleware/session.ts'
import { dmChannel } from '../lib/pubsub.ts'

export const invitesRoute = new Hono<HonoEnv>()

// Preview an invite without joining — shows the conversation name + member count so the
// recipient knows what they're walking into. Unauthenticated; the token IS the access control.
invitesRoute.get('/:token', async (c) => {
  const { db, mediaEnv } = c.get('ctx')
  const token = c.req.param('token')
  const invite = await loadInvite(db, token)
  if ('error' in invite) return c.json(invite, invite.status)

  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, invite.invite.conversationId))
    .limit(1)
  if (!conv) return c.json({ error: 'not_found' }, 404)

  const memberRows = await db
    .select({ user: schema.users })
    .from(schema.conversationMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.conversationMembers.userId))
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conv.id),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
    .limit(8)

  return c.json({
    invite: {
      conversation: {
        id: conv.id,
        kind: conv.kind,
        title: conv.title,
        memberCount: memberRows.length,
        previewMembers: memberRows.slice(0, 4).map((r) => ({
          id: r.user.id,
          handle: r.user.handle,
          displayName: r.user.displayName,
          avatarUrl: assetUrl(mediaEnv, r.user.avatarUrl),
          isVerified: r.user.isVerified,
          isContributor: r.user.isContributor,
          role: r.user.role,
        })),
      },
      expiresAt: invite.invite.expiresAt?.toISOString() ?? null,
      maxUses: invite.invite.maxUses,
      usedCount: invite.invite.usedCount,
    },
  })
})

invitesRoute.post('/:token/accept', requireHandle(), async (c) => {
  const session = c.get('session')!
  const me = session.user.id
  const { db, pubsub, rateLimit } = c.get('ctx')
  await rateLimit(c, 'invites.accept')
  const token = c.req.param('token')

  const invite = await loadInvite(db, token)
  if ('error' in invite) return c.json(invite, invite.status)

  const conversationId = invite.invite.conversationId
  // If already a member (active or soft-left), just return the conversation id without
  // burning a use on the invite.
  const [existing] = await db
    .select()
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, me),
      ),
    )
    .limit(1)

  await db.transaction(async (tx) => {
    if (existing) {
      if (existing.leftAt) {
        await tx
          .update(schema.conversationMembers)
          .set({ leftAt: null })
          .where(
            and(
              eq(schema.conversationMembers.conversationId, conversationId),
              eq(schema.conversationMembers.userId, me),
            ),
          )
      }
    } else {
      await tx.insert(schema.conversationMembers).values({
        conversationId,
        userId: me,
        role: 'member',
      })
    }
    // Atomic increment — survives concurrent accepts hitting the limit.
    await tx
      .update(schema.conversationInvites)
      .set({ usedCount: sql`${schema.conversationInvites.usedCount} + 1` })
      .where(eq(schema.conversationInvites.id, invite.invite.id))
  })

  // Notify everyone (including the joiner's own tabs) so headers + member lists refresh.
  const members = await db
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
  await Promise.all(
    members.map((m) =>
      pubsub.publish(dmChannel(m.userId), { type: 'membership', conversationId }),
    ),
  )
  return c.json({ id: conversationId })
})

async function loadInvite(
  db: import('@workspace/db').Database,
  token: string,
): Promise<
  | { invite: typeof schema.conversationInvites.$inferSelect }
  | { error: string; status: 404 | 410 }
> {
  const [invite] = await db
    .select()
    .from(schema.conversationInvites)
    .where(eq(schema.conversationInvites.token, token))
    .limit(1)
  if (!invite) return { error: 'not_found', status: 404 }
  if (invite.revokedAt) return { error: 'revoked', status: 410 }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return { error: 'expired', status: 410 }
  }
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
    return { error: 'exhausted', status: 410 }
  }
  return { invite }
}
