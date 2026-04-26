import { cn } from "@workspace/ui/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cn("size-10 rounded-full", className)} />
}

function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-full", className)} />
}

function SkeletonParagraph({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === lines - 1 ? "h-4 w-2/3" : "h-4 w-full"}
        />
      ))}
    </div>
  )
}

function SkeletonPostCard() {
  return (
    <div className="flex gap-3 border-b border-border px-4 py-4">
      <SkeletonAvatar />
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <SkeletonParagraph lines={2} />
      </div>
    </div>
  )
}

export {
  Skeleton,
  SkeletonAvatar,
  SkeletonText,
  SkeletonParagraph,
  SkeletonPostCard,
}
