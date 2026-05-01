import { and, eq, isNull } from 'drizzle-orm'

import * as schema from './schema/index.ts'

export type SystemReportReason = 'harassment' | 'illegal'

/** Deduped structured detail lines for moderation automation. */
export const SYSTEM_REPORT_SLUR_HIT = 'kind:slur_hit'
export const SYSTEM_REPORT_BLOCKED_ATTEMPT = 'kind:blocked_attempt'

/** One open automated report per (subject, reason, details) — avoids spam stacking. */
export async function ensureSystemReport(
  tx: any,
  input: {
    subjectType: string
    subjectId: string
    reason: SystemReportReason
    details: string
  },
): Promise<void> {
  const [existing] = await tx
    .select({ id: schema.reports.id })
    .from(schema.reports)
    .where(
      and(
        isNull(schema.reports.reporterId),
        eq(schema.reports.subjectType, input.subjectType),
        eq(schema.reports.subjectId, input.subjectId),
        eq(schema.reports.reason, input.reason),
        eq(schema.reports.status, 'open'),
        eq(schema.reports.details, input.details),
      ),
    )
    .limit(1)
  if (existing) return

  await tx.insert(schema.reports).values({
    reporterId: null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    details: input.details,
  })
}
