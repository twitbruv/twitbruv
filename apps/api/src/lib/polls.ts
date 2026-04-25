import { and, eq, inArray, schema } from '@workspace/db'
import type { Database } from '@workspace/db'

export interface PollOptionDto {
  id: string
  position: number
  text: string
  voteCount: number
}

export interface PollDto {
  id: string
  closesAt: string
  allowMultiple: boolean
  totalVotes: number
  closed: boolean
  options: Array<PollOptionDto>
  /** Option ids the viewer voted for. Empty if not authenticated or hasn't voted. */
  viewerVoteOptionIds?: Array<string>
}

interface RawOption {
  id: string
  pollId: string
  position: number
  text: string
  voteCount: number
}

interface RawPoll {
  id: string
  postId: string
  closesAt: Date
  allowMultiple: boolean
}

export async function loadPolls(
  db: Database,
  viewerId: string | undefined,
  postIds: Array<string>,
): Promise<Map<string, PollDto>> {
  const map = new Map<string, PollDto>()
  if (postIds.length === 0) return map

  const polls = (await db
    .select({
      id: schema.polls.id,
      postId: schema.polls.postId,
      closesAt: schema.polls.closesAt,
      allowMultiple: schema.polls.allowMultiple,
    })
    .from(schema.polls)
    .where(inArray(schema.polls.postId, postIds))) as Array<RawPoll>
  if (polls.length === 0) return map

  const pollIds = polls.map((p) => p.id)
  const options = (await db
    .select({
      id: schema.pollOptions.id,
      pollId: schema.pollOptions.pollId,
      position: schema.pollOptions.position,
      text: schema.pollOptions.text,
      voteCount: schema.pollOptions.voteCount,
    })
    .from(schema.pollOptions)
    .where(inArray(schema.pollOptions.pollId, pollIds))) as Array<RawOption>

  const viewerVotes = viewerId
    ? await db
        .select({ pollId: schema.pollVotes.pollId, optionId: schema.pollVotes.optionId })
        .from(schema.pollVotes)
        .where(and(eq(schema.pollVotes.userId, viewerId), inArray(schema.pollVotes.pollId, pollIds)))
    : []

  const viewerVoteByPoll = new Map<string, Array<string>>()
  for (const v of viewerVotes) {
    const arr = viewerVoteByPoll.get(v.pollId) ?? []
    arr.push(v.optionId)
    viewerVoteByPoll.set(v.pollId, arr)
  }

  const optionsByPoll = new Map<string, Array<RawOption>>()
  for (const o of options) {
    const arr = optionsByPoll.get(o.pollId) ?? []
    arr.push(o)
    optionsByPoll.set(o.pollId, arr)
  }

  const now = Date.now()
  for (const poll of polls) {
    const opts = (optionsByPoll.get(poll.id) ?? []).sort((a, b) => a.position - b.position)
    const totalVotes = opts.reduce((acc, o) => acc + o.voteCount, 0)
    map.set(poll.postId, {
      id: poll.id,
      closesAt: poll.closesAt.toISOString(),
      allowMultiple: poll.allowMultiple,
      totalVotes,
      closed: poll.closesAt.getTime() <= now,
      options: opts.map((o) => ({
        id: o.id,
        position: o.position,
        text: o.text,
        voteCount: o.voteCount,
      })),
      ...(viewerId ? { viewerVoteOptionIds: viewerVoteByPoll.get(poll.id) ?? [] } : {}),
    })
  }
  return map
}
