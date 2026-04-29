export default function LinkCardWithImage() {
	return (
		<div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-neutral bg-base-1">
			<div className="relative aspect-[1200/630] overflow-hidden bg-base-2">
				<img
					src="https://www.mahlke.design/og-image.png"
					alt=""
					className="absolute inset-0 h-full w-full object-cover"
					loading="eager"
					referrerPolicy="no-referrer"
				/>
			</div>
			<div className="space-y-2 p-3">
				<div className="flex gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-subtle ring-1 ring-neutral">
						<img
							src="https://www.google.com/s2/favicons?domain=mahlke.design&sz=32"
							alt=""
							width={36}
							height={36}
							className="size-full object-cover"
						/>
					</span>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="truncate text-[11px] text-tertiary">
							mahlke.design
						</div>
						<h3 className="text-[15px] leading-snug font-semibold tracking-tight text-primary">
							Aaron Mahlke – Design & Engineering
						</h3>
						<p className="line-clamp-3 text-[13px] leading-relaxed text-tertiary">
							I craft the surface – the part people see, hear, and interact with.
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
