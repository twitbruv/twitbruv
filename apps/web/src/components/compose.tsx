import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	PhotoIcon,
	ChartBarIcon,
	GlobeAltIcon,
	UsersIcon,
	AtSymbolIcon,
	XMarkIcon,
	PencilSquareIcon,
} from "@heroicons/react/24/solid"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Avatar } from "@workspace/ui/components/avatar"
import { Input } from "@workspace/ui/components/input"
import {
	Select,
	SelectTrigger,
	SelectContent,
	SelectItem,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import {
	POST_MAX_LEN,
	POLL_MAX_OPTIONS,
	POLL_MIN_OPTIONS,
	POLL_OPTION_MAX_LEN,
} from "@workspace/validators"
import { api } from "../lib/api"
import { uploadImage, setAltText } from "../lib/media"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { loadDraft, saveDraft, clearDraft, draftKey } from "../lib/drafts"
import { useMe } from "../lib/me"
import type { Post, PollInput } from "../lib/api"
import type { UploadedMedia } from "../lib/media"

// ───────────────────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────────────────

const MAX_ATTACHMENTS = 4

const REPLY_OPTIONS = [
	{ value: "anyone" as const, label: "Everyone", icon: GlobeAltIcon },
	{ value: "following" as const, label: "Following", icon: UsersIcon },
	{ value: "mentioned" as const, label: "Mentions", icon: AtSymbolIcon },
] as const

const POLL_DURATION_CHOICES = [
	{ label: "5 minutes", minutes: 5 },
	{ label: "1 hour", minutes: 60 },
	{ label: "1 day", minutes: 60 * 24 },
	{ label: "3 days", minutes: 60 * 24 * 3 },
	{ label: "7 days", minutes: 60 * 24 * 7 },
] as const

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

interface PendingAttachment {
  tempId: string
  status: "uploading" | "ready" | "failed"
  previewUrl: string
  media?: UploadedMedia
  altText: string
  error?: string
  removing?: boolean
}

interface PollOptionState {
	id: string
	value: string
}

interface PollState {
	options: PollOptionState[]
	durationMinutes: number
	allowMultiple: boolean
}

export interface ComposeProps {
	onCreated?: (post: Post) => void
	replyToId?: string
	quoteOfId?: string
	quoted?: Post
	placeholder?: string
	collapsible?: boolean
	autoFocus?: boolean
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function createId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createPollOption(value = ""): PollOptionState {
	return { id: createId(), value }
}

function resizeTextarea(el: HTMLTextAreaElement | null) {
	if (!el) return
	el.style.height = "auto"
	el.style.height = `${el.scrollHeight}px`
}

function CharacterRing({ used, max }: { used: number; max: number }) {
	const radius = 6
	const circumference = 2 * Math.PI * radius
	const pct = Math.min(used / max, 1)
	const dash = circumference * pct
	const remaining = max - used

	let colorClass = "text-tertiary"
	if (remaining < 0) {
		colorClass = "text-danger"
	} else if (remaining < 20) {
		colorClass = "text-warn"
	}

	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			className={`shrink-0 -rotate-90 ${colorClass}`}
		>
			<circle
				cx="8"
				cy="8"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				opacity="0.15"
			/>
			<circle
				cx="8"
				cy="8"
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={`${dash} ${circumference}`}
				strokeDashoffset="0"
				strokeLinecap="round"
			/>
		</svg>
	)
}

// ───────────────────────────────────────────────────────────────────────────
// Compose
// ───────────────────────────────────────────────────────────────────────────

export function Compose({
	onCreated,
	replyToId,
	quoteOfId,
	quoted,
	placeholder = "What's happening?",
	collapsible = false,
	autoFocus = false,
}: ComposeProps) {
	const { me } = useMe()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const dKey = useMemo(
		() => draftKey({ replyToId, quoteOfId }),
		[replyToId, quoteOfId],
	)

	const [text, setText] = useState(() => loadDraft(dKey))
	const [expanded, setExpanded] = useState(
		() => !collapsible || loadDraft(dKey).length > 0,
	)
	const [attachments, setAttachments] = useState<PendingAttachment[]>([])
	const [poll, setPoll] = useState<PollState | null>(null)
	const [loading, setLoading] = useState(false)
	const [replyRestriction, setReplyRestriction] = useState<
		"anyone" | "following" | "mentioned"
	>("anyone")
	const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(
		null,
	)
	const [isDragging, setIsDragging] = useState(false)
	const showReplyControl = !replyToId

	useEffect(() => {
		saveDraft(dKey, text)
	}, [dKey, text])

	useEffect(() => {
		resizeTextarea(textareaRef.current)
	}, [text, expanded])

	useEffect(() => {
		if (autoFocus && textareaRef.current) {
			textareaRef.current.focus()
		}
	}, [autoFocus])

	const readyMediaIds = attachments
		.filter((a) => a.status === "ready" && a.media)
		.map((a) => a.media!.id)

	const pollValid =
		!poll ||
		(poll.options.filter((o) => o.value.trim().length > 0).length >=
			POLL_MIN_OPTIONS &&
			poll.options.every((o) => o.value.length <= POLL_OPTION_MAX_LEN))

	const hasContent =
		text.trim().length > 0 ||
		readyMediaIds.length > 0 ||
		Boolean(quoteOfId) ||
		Boolean(poll)

	const noneUploading = attachments.every((a) => a.status !== "uploading")
	const canSubmit =
		hasContent &&
		POST_MAX_LEN - text.length >= 0 &&
		noneUploading &&
		pollValid &&
		!loading

	const handleTextChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setText(e.target.value)
			if (collapsible) setExpanded(true)
		},
		[collapsible],
	)

	// ── Collapsible mode: collapse on Escape when empty ───────────────

	useEffect(() => {
		if (!collapsible) return
		function onKeyDown(e: KeyboardEvent) {
			if (e.key !== "Escape") return
			if (hasContent) return
			setExpanded(false)
			textareaRef.current?.blur()
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [collapsible, hasContent])

	const addFiles = useCallback(
		async (files: FileList | ReadonlyArray<File> | null) => {
			if (!files) return
			const incoming = (Array.isArray(files)
				? files
				: Array.from(files)
			).slice(0, MAX_ATTACHMENTS - attachments.length)

			for (const file of incoming) {
				if (!file.type.startsWith("image/")) continue
				const tempId = createId()
				const previewUrl = URL.createObjectURL(file)
				setAttachments((prev) => [
					...prev,
					{ tempId, status: "uploading", previewUrl, altText: "" },
				])
				try {
					const media = await uploadImage(file)
					setAttachments((prev) =>
						prev.map((a) =>
							a.tempId === tempId
								? { ...a, status: "ready", media }
								: a,
						),
					)
				} catch (e) {
					setAttachments((prev) =>
						prev.map((a) =>
							a.tempId === tempId
								? {
										...a,
										status: "failed",
										error:
											e instanceof Error
												? e.message
												: "upload failed",
								  }
								: a,
						),
					)
				}
			}
		},
		[attachments.length],
	)

	const removeAttachment = useCallback((tempId: string) => {
		setAttachments((prev) =>
			prev.map((a) =>
				a.tempId === tempId ? { ...a, removing: true } : a,
			),
		)
		setTimeout(() => {
			setAttachments((prev) => {
				const removed = prev.find((a) => a.tempId === tempId)
				if (removed) URL.revokeObjectURL(removed.previewUrl)
				return prev.filter((a) => a.tempId !== tempId)
			})
		}, 200)
	}, [])

	const startPoll = useCallback(() => {
		if (poll) return
		setPoll({
			options: [createPollOption(), createPollOption()],
			durationMinutes: 60 * 24,
			allowMultiple: false,
		})
	}, [poll])

	const addPollOption = useCallback(() => {
		setPoll((p) => {
			if (!p || p.options.length >= POLL_MAX_OPTIONS) return p
			return { ...p, options: [...p.options, createPollOption()] }
		})
	}, [])

	const updatePollOption = useCallback((id: string, value: string) => {
		setPoll((p) =>
			p
				? {
						...p,
						options: p.options.map((o) =>
							o.id === id ? { ...o, value } : o,
						),
				  }
				: null,
		)
	}, [])

	const removePollOption = useCallback((id: string) => {
		setPoll((p) => {
			if (!p || p.options.length <= POLL_MIN_OPTIONS) return p
			return { ...p, options: p.options.filter((o) => o.id !== id) }
		})
	}, [])

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault()
			if (!canSubmit) return
			setLoading(true)
			try {
				await Promise.all(
					attachments
						.filter(
							(a) =>
								a.status === "ready" &&
								a.media &&
								a.altText.trim().length > 0,
						)
						.map((a) =>
							setAltText(a.media!.id, a.altText).catch(() => {}),
						),
				)

				const pollPayload: PollInput | undefined = poll
					? {
							options: poll.options
								.map((o) => o.value.trim())
								.filter((o) => o.length > 0),
							durationMinutes: poll.durationMinutes,
							allowMultiple: poll.allowMultiple,
					  }
					: undefined

				const { post } = await api.createPost({
					text: text.trim(),
					replyToId,
					quoteOfId,
					mediaIds:
						readyMediaIds.length > 0 ? readyMediaIds : undefined,
					poll: pollPayload,
					replyRestriction: showReplyControl
						? replyRestriction
						: undefined,
				})

				setText("")
				clearDraft(dKey)
				attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
				setAttachments([])
				setPoll(null)
				if (collapsible) setExpanded(false)
				onCreated?.(post)
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "failed to post",
				)
			} finally {
				setLoading(false)
			}
		},
		[
			canSubmit,
			attachments,
			poll,
			text,
			replyToId,
			quoteOfId,
			readyMediaIds,
			showReplyControl,
			replyRestriction,
			dKey,
			collapsible,
			onCreated,
		],
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault()
				if (canSubmit) {
					const fakeEvent = new Event("submit", {
						bubbles: true,
					}) as unknown as React.FormEvent
					handleSubmit(fakeEvent)
				}
			}
		},
		[canSubmit, handleSubmit],
	)

	// Window-level drag listeners for drop-anywhere
	useEffect(() => {
		function onDragEnter(e: DragEvent) {
			if (attachments.length >= MAX_ATTACHMENTS) return
			if (!e.dataTransfer?.types.includes("Files")) return
			e.preventDefault()
			setIsDragging(true)
			if (collapsible) setExpanded(true)
		}
		function onDragOver(e: DragEvent) {
			if (attachments.length >= MAX_ATTACHMENTS) return
			e.preventDefault()
		}
		function onDragLeave(e: DragEvent) {
			if (!e.relatedTarget) setIsDragging(false)
		}
		function onDrop(e: DragEvent) {
			if (attachments.length >= MAX_ATTACHMENTS) return
			e.preventDefault()
			setIsDragging(false)
			if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
		}
		window.addEventListener("dragenter", onDragEnter)
		window.addEventListener("dragover", onDragOver)
		window.addEventListener("dragleave", onDragLeave)
		window.addEventListener("drop", onDrop)
		return () => {
			window.removeEventListener("dragenter", onDragEnter)
			window.removeEventListener("dragover", onDragOver)
			window.removeEventListener("dragleave", onDragLeave)
			window.removeEventListener("drop", onDrop)
		}
	}, [attachments.length, addFiles, collapsible])

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			if (attachments.length >= MAX_ATTACHMENTS) return
			const files = getPastedImageFiles(e)
			if (files.length === 0) return
			e.preventDefault()
			void addFiles(files)
		},
		[attachments.length, addFiles],
	)

	// ── Render ─────────────────────────────────────────────────────────

	const currentReply = REPLY_OPTIONS.find(
		(o) => o.value === replyRestriction,
	)!
	const ReplyIcon = currentReply.icon

	function buttonLabel(): string {
		if (loading) return "Posting…"
		if (replyToId) return "Reply"
		if (quoteOfId) return "Quote"
		return "Post"
	}

	return (
		<>
			{/* Fullscreen overlay behind composer */}
			<div
				className={cn(
					"pointer-events-none fixed inset-0 z-40 transition-[opacity,transform] duration-200 ease-out-expo",
					isDragging && attachments.length < MAX_ATTACHMENTS
						? "opacity-100 scale-100"
						: "opacity-0 scale-95",
				)}
			>
				<div className="h-full w-full bg-base-1/80" />
			</div>
			<form
				onSubmit={handleSubmit}
				className="relative z-50 flex gap-3 px-4 py-3"
			>
			{/* Avatar */}
			<div className="shrink-0">
				<Avatar
					initial={
						(me?.displayName ?? me?.handle ?? "·")
							.slice(0, 1)
							.toUpperCase() || "·"
					}
					src={me?.avatarUrl}
					size="lg"
				/>
			</div>

			{/* Content */}
			<div className="min-w-0 flex-1">
				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={text}
					onChange={handleTextChange}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (collapsible) setExpanded(true)
					}}
					onPaste={handlePaste}
					placeholder={placeholder}
					rows={expanded ? 2 : 1}
					maxLength={POST_MAX_LEN * 2}
					className={cn(
						"w-full resize-none bg-transparent pt-2 text-[15px] leading-relaxed text-primary outline-none placeholder:text-tertiary",
						!expanded && "h-[24px]",
					)}
				/>

				{/* Quoted post preview */}
				{quoted && (
					<div className="mt-2 rounded-xl border border-neutral p-3 text-sm">
						<div className="flex items-center gap-2 text-xs text-tertiary">
							<span className="font-medium text-primary">
								{quoted.author.displayName ??
									`@${quoted.author.handle ?? "unknown"}`}
							</span>
							{quoted.author.handle && (
								<span>@{quoted.author.handle}</span>
							)}
						</div>
						<p className="mt-1 line-clamp-3 whitespace-pre-wrap text-primary">
							{quoted.text}
						</p>
					</div>
				)}

				{/* Poll */}
				{poll && (
					<div className="mt-3 flex flex-col gap-2 rounded-xl border border-neutral p-3">
						<div className="flex items-center justify-between">
							<span className="text-xs font-medium text-tertiary">
								Poll
							</span>
							<Button
								type="button"
								variant="transparent"
								size="sm"
								onClick={() => setPoll(null)}
								className="text-xs text-tertiary"
							>
								Remove
							</Button>
						</div>
						{poll.options.map((opt, idx) => (
							<div key={opt.id} className="flex items-center gap-2">
								<Input
									value={opt.value}
									onChange={(e) =>
										updatePollOption(opt.id, e.target.value)
									}
									placeholder={`Choice ${idx + 1}`}
									maxLength={POLL_OPTION_MAX_LEN}
									className="flex-1"
								/>
								{poll.options.length > POLL_MIN_OPTIONS && (
									<Button
										type="button"
										variant="transparent"
										size="sm"
										onClick={() => removePollOption(opt.id)}
										aria-label="Remove choice"
										iconLeft={<XMarkIcon className="size-4" />}
									/>
								)}
							</div>
						))}
						{poll.options.length < POLL_MAX_OPTIONS && (
							<Button
								type="button"
								variant="transparent"
								size="sm"
								onClick={addPollOption}
								className="w-fit text-xs"
							>
								Add choice
							</Button>
						)}
						<div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<Label className="shrink-0 text-xs text-tertiary">
									Duration
								</Label>
								<Select
									value={String(poll.durationMinutes)}
									onValueChange={(v) =>
										setPoll((p) =>
											p
												? {
														...p,
														durationMinutes: Number(v),
												  }
												: null,
										)
									}
								>
									<SelectTrigger size="sm" className="h-8 flex-1" />
									<SelectContent>
										{POLL_DURATION_CHOICES.map((c) => (
											<SelectItem
												key={c.minutes}
												value={String(c.minutes)}
											>
												{c.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex items-center gap-2">
								<Switch
									checked={poll.allowMultiple}
									onCheckedChange={(v) =>
										setPoll((p) =>
											p ? { ...p, allowMultiple: v } : null,
										)
									}
								/>
								<Label className="text-xs text-tertiary">
									Multiple choice
								</Label>
							</div>
						</div>
					</div>
				)}

				{/* Attachments */}
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-200 ease-out-expo",
						attachments.length > 0
							? "grid-rows-[1fr]"
							: "grid-rows-[0fr]",
					)}
				>
					<div className="min-h-0 overflow-hidden">
						<div className="mt-2 space-y-2">
							<div
								className={cn(
									"grid gap-0.5 overflow-hidden rounded-xl",
									attachments.length === 1 && "grid-cols-1",
									attachments.length === 2 && "grid-cols-2",
									attachments.length >= 3 &&
										"grid-cols-2 grid-rows-2",
								)}
							>
								{attachments.map((a, i) => (
									<div
										key={a.tempId}
										className={cn(
											"grid transition-[grid-template-rows] duration-200 ease-out-expo",
											a.removing
												? "grid-rows-[0fr]"
												: "grid-rows-[1fr]",
										)}
									>
										<div className="min-h-0 overflow-hidden">
											<div
												className={cn(
													"relative transition-all duration-200 ease-out-expo",
													a.removing
														? "opacity-0 scale-95"
														: "opacity-100 scale-100",
												)}
											>
												<div
													className={cn(
														"relative overflow-hidden bg-base-2",
														attachments.length === 1 &&
															"max-h-80",
														attachments.length === 2 &&
															"aspect-[4/3]",
														attachments.length >= 3 &&
															i === 0 &&
															"row-span-2 h-full",
														attachments.length >= 3 &&
															i > 0 &&
															"aspect-square",
													)}
												>
													<img
														src={a.previewUrl}
														alt=""
														className="h-full w-full object-cover"
													/>
													{a.status === "uploading" && (
														<div className="absolute inset-0 flex items-center justify-center bg-base-1/50">
															<div className="h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-primary" />
														</div>
													)}
													{a.status === "failed" && (
														<div className="absolute inset-0 flex items-center justify-center bg-danger-subtle/50 p-2 text-center text-xs text-danger">
															{a.error ?? "failed"}
														</div>
													)}
													{/* Edit button */}
													<button
														type="button"
														onClick={() =>
															setEditingAttachmentId(
																editingAttachmentId === a.tempId
																	? null
																	: a.tempId,
															)
														}
														className="absolute top-1.5 left-1.5 flex size-7 items-center justify-center rounded-full bg-base-1/80 text-primary backdrop-blur-sm transition-colors hover:bg-base-1"
													>
														<PencilSquareIcon className="size-3.5" />
													</button>
													{/* Remove button */}
													<button
														type="button"
														onClick={() => removeAttachment(a.tempId)}
														disabled={a.removing}
														className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-base-1/80 text-primary backdrop-blur-sm transition-colors hover:bg-base-1"
													>
														<XMarkIcon className="size-3.5" />
													</button>
												</div>
											</div>
										</div>
									</div>
								))}
						</div>
						{/* Alt text panel for editing */}
						{editingAttachmentId && (
							(() => {
								const a = attachments.find(
									(x) => x.tempId === editingAttachmentId,
								)
								if (!a) return null
								return (
									<div className="rounded-xl border border-neutral p-3">
										<div className="flex items-center justify-between">
											<span className="text-xs font-medium text-tertiary">
												Alt text
											</span>
											<button
												type="button"
												onClick={() =>
													setEditingAttachmentId(null)
												}
												className="flex size-6 items-center justify-center rounded-full text-tertiary hover:text-primary"
											>
												<XMarkIcon className="size-3.5" />
											</button>
										</div>
										<textarea
											value={a.altText}
											onChange={(e) =>
												setAttachments(
													(prev) =>
														prev.map((x) =>
															x.tempId ===
															a.tempId
																? {
																		...x,
																		altText: e
																				.target
																					.value,
																  }
																: x,
														),
												)
											}
											placeholder="Describe this image for people who are blind or have low vision"
											maxLength={1000}
											rows={2}
											className="mt-2 w-full resize-none rounded-lg border border-neutral bg-base-2 px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary focus:border-neutral-strong"
										/>
									</div>
								)
							})()
						)}
						</div>
					</div>
				</div>

				{/* Drop zone */}
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-200 ease-out-expo",
						isDragging && attachments.length < MAX_ATTACHMENTS
							? "grid-rows-[1fr]"
							: "grid-rows-[0fr]",
					)}
				>
					<div className="min-h-0">
						<div
							className={cn(
								"mt-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-strong bg-subtle py-10 origin-top transition-all duration-200 ease-out-expo",
								isDragging && attachments.length < MAX_ATTACHMENTS
									? "opacity-100 scale-100 translate-y-0"
									: "opacity-0 scale-95 -translate-y-1",
							)}
						>
							<PhotoIcon className="size-8 text-tertiary" />
							<span className="mt-2 text-sm text-tertiary">
								Drop images here
							</span>
						</div>
					</div>
				</div>

				{/* Action bar */}
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-200 ease-out-expo",
						expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
					)}
				>
					<div className="min-h-0">
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
									addFiles(e.target.files)
									e.currentTarget.value = ""
								}}
							/>

							{/* Photo button */}
							<Button
								type="button"
								variant="transparent"
								size="sm"
								disabled={
									attachments.length >= MAX_ATTACHMENTS ||
									Boolean(poll)
								}
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
									Boolean(poll) ||
									attachments.length > 0 ||
									Boolean(replyToId) ||
									Boolean(quoteOfId)
								}
								onClick={startPoll}
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
														setReplyRestriction(opt.value)
													}
													icon={
														<Icon className="size-4" />
													}
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
								<CharacterRing used={text.length} max={POST_MAX_LEN} />
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
								{buttonLabel()}
							</Button>
						</div>
					</div>
				</div>
		</div>
		</form>
		</>
	)
}
