export default function LinkCardNoImage() {
	return (
		<div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-neutral bg-base-1">
			<div className="space-y-2 p-3">
				<div className="flex gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle ring-1 ring-neutral">
						<span className="text-xs font-bold text-tertiary">G</span>
					</span>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="truncate text-[11px] text-tertiary">
							github.com
						</div>
						<h3 className="text-[15px] leading-snug font-semibold tracking-tight text-primary">
							twitbruv/twitbruv
						</h3>
						<p className="line-clamp-3 text-[13px] leading-relaxed text-tertiary">
							A social layer for developers: short posts, articles, DMs, and repo context.
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
