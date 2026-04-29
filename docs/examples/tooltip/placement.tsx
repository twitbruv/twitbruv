import { Button } from "@workspace/ui/components/button"
import { Tooltip } from "@workspace/ui/components/tooltip"

export default function TooltipPlacement() {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<Tooltip label="Top" side="top">
				<Button variant="outline">Top</Button>
			</Tooltip>
			<Tooltip label="Bottom" side="bottom">
				<Button variant="outline">Bottom</Button>
			</Tooltip>
			<Tooltip label="Left" side="left">
				<Button variant="outline">Left</Button>
			</Tooltip>
			<Tooltip label="Right" side="right">
				<Button variant="outline">Right</Button>
			</Tooltip>
		</div>
	)
}
