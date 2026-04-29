import { Button } from "@workspace/ui/components/button"
import { Tooltip } from "@workspace/ui/components/tooltip"

export default function TooltipDefault() {
	return (
		<Tooltip label="This is a tooltip">
			<Button variant="outline">Hover me</Button>
		</Tooltip>
	)
}
