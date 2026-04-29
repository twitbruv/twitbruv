import { Button } from "@workspace/ui/components/button"
import { PreviewCard } from "@workspace/ui/components/preview-card"

export default function PreviewCardPlacement() {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">Right</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="right">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Right</p>
						<p className="mt-1 text-xs text-tertiary">Card appears to the right.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>

			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">Top</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="top">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Top</p>
						<p className="mt-1 text-xs text-tertiary">Card appears above the trigger.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>

			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">Bottom</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="bottom">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Bottom</p>
						<p className="mt-1 text-xs text-tertiary">Card appears below the trigger.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>

			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">Left</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="left">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Left</p>
						<p className="mt-1 text-xs text-tertiary">Card appears to the left.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>
		</div>
	)
}
