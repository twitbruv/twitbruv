import { loadAffinityCandidates } from "./affinity.ts"
import { mergeCandidateSignals } from "./merge.ts"
import { loadNetworkCandidates } from "./network.ts"
import { loadFreshPublicCandidates } from "./public.ts"
import { hydrateRecentEngagement } from "./recent-engagement.ts"
import type { ForYouCandidate } from "./types.ts"
import type { QueryContext } from "../query-context.ts"
import type { RankerRuntime } from "../runtime.ts"

export type { ForYouCandidate } from "./types.ts"

export async function loadCandidates(
  context: QueryContext,
  runtime: RankerRuntime
): Promise<Array<ForYouCandidate>> {
  const [network, affinity, freshPublic] = await Promise.all([
    loadNetworkCandidates(context, runtime),
    loadAffinityCandidates(context, runtime),
    loadFreshPublicCandidates(context, runtime),
  ])

  const candidates = mergeCandidateSignals([
    ...network,
    ...affinity,
    ...freshPublic,
  ])
  await hydrateRecentEngagement(candidates, runtime, context.requestedAt)
  return candidates
}
