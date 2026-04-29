import { Button } from "@workspace/ui/components/button"
import { PreviewCard } from "@workspace/ui/components/preview-card"

export default function PreviewCardDefault() {
	return (
		<PreviewCard.Root>
			<PreviewCard.Trigger render={<span className="inline" />}>
				<Button variant="outline">Hover me</Button>
			</PreviewCard.Trigger>
			<PreviewCard.Content>
				<div className="p-4">
					<p className="text-sm font-semibold text-primary">Preview Card</p>
					<p className="mt-1 text-xs text-tertiary">
						This card appears on hover. Put any content you want here.
					</p>
				</div>
			</PreviewCard.Content>
		</PreviewCard.Root>
	)
}
