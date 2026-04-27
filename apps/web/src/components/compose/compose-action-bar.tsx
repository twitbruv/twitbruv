import { PhotoIcon, ChartBarIcon } from "@heroicons/react/24/solid"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import { POST_MAX_LEN } from "@workspace/validators"
import { CharacterRing } from "./character-ring"
import { REPLY_OPTIONS, MAX_ATTACHMENTS } from "./types"

interface ComposeActionBarProps {
	expanded: boolean
	fileInputRef: React.RefObject<HTMLInputElement | null>
	attachmentsCount: number
	hasPoll: boolean
	replyToId?: string
	quoteOfId?: string
	showReplyControl: boolean
	replyRestriction: "anyone" | "following" | "mentioned"
	onSetReplyRestriction: (value: "anyone" | "following" | "mentioned") => void
	textLength: number
	canSubmit: boolean
	buttonLabel: string
	onAddFiles: (files: FileList | ReadonlyArray<File> | null) => void
	onStartPoll: () => void
}

export function ComposeActionBar({
	expanded,
	fileInputRef,
	attachmentsCount,
	hasPoll,
	replyToId,
	quoteOfId,
	showReplyControl,
	replyRestriction,
	onSetReplyRestriction,
	textLength,
	canSubmit,
	buttonLabel,
	onAddFiles,
	onStartPoll,
}: ComposeActionBarProps) {
	const currentReply = REPLY_OPTIONS.find((o) => o.value === replyRestriction)!
	const ReplyIcon = currentReply.icon

	return (
		<div
			className={cn(
				"grid transition-[grid-template-rows] duration-200 ease-out-expo",
				expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			)}
		>
		<div className={cn("min-h-0", !expanded && "pointer-events-none")}>
			<div
				className={cn(
					"mt-3 flex items-center justify-between origin-top transition-all duration-200 ease-out-expo",
					expanded
						? "opacity-100 scale-100 translate-y-0"
						: "opacity-0 scale-95 -translate-y-1",
				)}
				>
					<div className="flex items-center gap-1">
						{/* Hidden file input */}
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							hidden
							onChange={(e) => {
								onAddFiles(e.target.files)
								e.currentTarget.value = ""
							}}
						/>

						{/* Photo button */}
						<Button
							type="button"
							variant="transparent"
							size="sm"
							disabled={attachmentsCount >= MAX_ATTACHMENTS || hasPoll}
							onClick={() => fileInputRef.current?.click()}
							aria-label="Add image"
							iconLeft={<PhotoIcon className="size-4" />}
						/>

						{/* Poll button */}
						<Button
							type="button"
							variant="transparent"
							size="sm"
							disabled={
								hasPoll ||
								attachmentsCount > 0 ||
								Boolean(replyToId) ||
								Boolean(quoteOfId)
							}
							onClick={onStartPoll}
							aria-label="Add poll"
							iconLeft={<ChartBarIcon className="size-4" />}
						/>

						{/* Reply restriction */}
						{showReplyControl && (
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									render={
										<Button
											type="button"
											variant="transparent"
											size="sm"
											iconLeft={
												<ReplyIcon className="size-4" />
											}
										>
											{currentReply.label}
										</Button>
									}
								/>
								<DropdownMenu.Content align="start" sideOffset={4}>
									{REPLY_OPTIONS.map((opt) => {
										const Icon = opt.icon
										return (
											<DropdownMenu.Item
												key={opt.value}
												onClick={() =>
													onSetReplyRestriction(opt.value)
												}
												icon={<Icon className="size-4" />}
											>
												{opt.label}
											</DropdownMenu.Item>
										)
									})}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						)}

						{/* Character ring */}
						<div className="ml-2">
							<CharacterRing used={textLength} max={POST_MAX_LEN} />
						</div>
					</div>

					{/* Post button */}
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={!canSubmit}
						className="rounded-full px-4"
					>
						{buttonLabel}
					</Button>
				</div>
			</div>
		</div>
	)
}
