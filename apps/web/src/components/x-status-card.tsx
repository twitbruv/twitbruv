import { XStatusCard } from "@workspace/ui/components/x-status-card"
import type { XUnfurlCard } from "../lib/api"

export function XStatusCardBlock({
  card,
  className,
}: {
  card: XUnfurlCard
  className?: string
}) {
  return (
    <XStatusCard
      url={card.url}
      text={card.text}
      authorScreenName={card.authorScreenName}
      authorName={card.authorName}
      authorAvatarUrl={card.authorAvatarUrl}
      authorVerified={card.authorVerified}
      replies={card.replies}
      retweets={card.retweets}
      likes={card.likes}
      quotes={card.quotes}
      views={card.views}
      createdAt={card.createdAt}
      className={className}
    />
  )
}
