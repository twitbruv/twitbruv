import {
  LinkCard,
  LinkPill,
  trimTrailingPunct,
} from "@workspace/ui/components/link-card"
import type { GenericUnfurlCard } from "../lib/api"

export { LinkPill, trimTrailingPunct }

export function LinkCardBlock({
  card,
  className,
}: {
  card: GenericUnfurlCard
  className?: string
}) {
  return (
    <LinkCard
      url={card.url}
      title={card.title}
      description={card.description}
      imageUrl={card.imageUrl}
      siteName={card.siteName}
      className={className}
    />
  )
}
