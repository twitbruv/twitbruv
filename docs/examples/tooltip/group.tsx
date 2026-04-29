import {
	BoldIcon,
	ItalicIcon,
	StrikethroughIcon,
	UnderlineIcon,
} from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { Tooltip } from "@workspace/ui/components/tooltip"

export default function TooltipGroup() {
	return (
		<Tooltip.Group delay={200}>
			<div className="flex items-center gap-1">
				<Tooltip label="Bold">
					<Button variant="outline" iconLeft={<BoldIcon />} aria-label="Bold" />
				</Tooltip>
				<Tooltip label="Italic">
					<Button variant="outline" iconLeft={<ItalicIcon />} aria-label="Italic" />
				</Tooltip>
				<Tooltip label="Underline">
					<Button variant="outline" iconLeft={<UnderlineIcon />} aria-label="Underline" />
				</Tooltip>
				<Tooltip label="Strikethrough">
					<Button variant="outline" iconLeft={<StrikethroughIcon />} aria-label="Strikethrough" />
				</Tooltip>
			</div>
		</Tooltip.Group>
	)
}
