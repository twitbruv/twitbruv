import { Button } from "@workspace/ui/components/button"
import { PreviewCard } from "@workspace/ui/components/preview-card"

export default function PreviewCardAlignment() {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">Start</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="bottom" align="start">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Align Start</p>
						<p className="mt-1 text-xs text-tertiary">Card aligns to the start of the trigger.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>

			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">Center</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="bottom" align="center">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Align Center</p>
						<p className="mt-1 text-xs text-tertiary">Card is centered relative to the trigger.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>

			<PreviewCard.Root>
				<PreviewCard.Trigger render={<span className="inline" />}>
					<Button variant="outline">End</Button>
				</PreviewCard.Trigger>
				<PreviewCard.Content side="bottom" align="end">
					<div className="p-4">
						<p className="text-sm font-semibold text-primary">Align End</p>
						<p className="mt-1 text-xs text-tertiary">Card aligns to the end of the trigger.</p>
					</div>
				</PreviewCard.Content>
			</PreviewCard.Root>
		</div>
	)
}
