import { useRef, useState } from "react"
import {
  ChartBarIcon,
  FaceSmileIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid"
import { Popover } from "@base-ui/react/popover"
import { EmojiPicker } from "frimousse"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu } from "@workspace/ui/components/dropdown-menu"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { POST_MAX_LEN } from "@workspace/validators"
import { CharacterRing } from "./character-ring"
import { MAX_ATTACHMENTS, REPLY_OPTIONS } from "./types"
import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse"

// Hoisted so frimousse's per-row React.memo isn't busted on every parent render.
const EmojiCategoryHeader = ({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) => (
  <div
    {...props}
    className="bg-base-2 px-3 pt-3 pb-2 text-xs leading-none text-tertiary"
  >
    {category.label}
  </div>
)

const EmojiRow = ({ children, ...props }: EmojiPickerListRowProps) => (
  <div {...props} className="scroll-my-1 px-1">
    {children}
  </div>
)

const EmojiButton = ({ emoji, ...props }: EmojiPickerListEmojiProps) => (
  <button
    {...props}
    className="flex size-7 items-center justify-center rounded-md text-base data-[active]:bg-base-1"
  >
    {emoji.emoji}
  </button>
)

const EMOJI_LIST_COMPONENTS = {
  CategoryHeader: EmojiCategoryHeader,
  Row: EmojiRow,
  Emoji: EmojiButton,
}

function EmojiPickerPopup({
  onInsertEmoji,
}: {
  onInsertEmoji: (emoji: string) => void
}) {
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  return (
    <EmojiPicker.Root
      className="isolate flex h-[320px] w-fit flex-col"
      onEmojiSelect={({ emoji }) => onInsertEmoji(emoji)}
    >
      <div className="flex h-10 items-center gap-2 border-b border-neutral pr-1.5 pl-3">
        <MagnifyingGlassIcon className="size-4 shrink-0 text-tertiary" />
        <EmojiPicker.Search
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            "flex h-9 w-full appearance-none bg-transparent text-sm text-primary outline-none placeholder:text-tertiary",
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          )}
          aria-label="Search emoji"
          placeholder="Search emoji…"
        />
        {search.length > 0 && (
          <Button
            type="button"
            variant="transparent"
            size="sm"
            aria-label="Clear search"
            onClick={() => {
              setSearch("")
              searchRef.current?.focus()
            }}
            iconLeft={<XMarkIcon className="size-4" />}
          />
        )}
      </div>
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-tertiary">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-tertiary">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="pb-1 select-none"
          components={EMOJI_LIST_COMPONENTS}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  )
}

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
  onInsertEmoji: (emoji: string) => void
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
  onInsertEmoji,
}: ComposeActionBarProps) {
  const currentReply = REPLY_OPTIONS.find((o) => o.value === replyRestriction)!
  const ReplyIcon = currentReply.icon

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out-expo",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className={cn("min-h-0", !expanded && "pointer-events-none")}>
        <div
          className={cn(
            "mt-3 flex origin-top items-center justify-between transition-all duration-200 ease-out-expo",
            expanded
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-1 scale-95 opacity-0"
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

            <Tooltip.Group delay={200} side="bottom">
              {/* Photo button */}
              <Tooltip label="Add image">
                <Button
                  type="button"
                  variant="transparent"
                  size="sm"
                  disabled={attachmentsCount >= MAX_ATTACHMENTS || hasPoll}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add image"
                  iconLeft={<PhotoIcon className="size-4" />}
                />
              </Tooltip>

              {/* Poll button */}
              <Tooltip label="Add poll">
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
              </Tooltip>

              {/* Emoji button */}
              <Popover.Root>
                <Tooltip label="Add emoji">
                  <Popover.Trigger
                    render={
                      <Button
                        type="button"
                        variant="transparent"
                        size="sm"
                        aria-label="Add emoji"
                        iconLeft={<FaceSmileIcon className="size-4" />}
                      />
                    }
                  />
                </Tooltip>
                <Popover.Portal>
                  <Popover.Positioner
                    sideOffset={6}
                    align="start"
                    className="z-50"
                  >
                    <Popover.Popup
                      // Mirrors Menu.Panel's open/close animation.
                      className={cn(
                        "overflow-hidden rounded-xl border border-neutral bg-base-2 shadow-sm outline-none",
                        "origin-[var(--transform-origin)] will-change-[transform,opacity]",
                        "transition-[transform,scale,opacity] duration-200 ease-out-expo",
                        "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
                        "data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
                        "motion-reduce:transition-none"
                      )}
                    >
                      <EmojiPickerPopup onInsertEmoji={onInsertEmoji} />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </Tooltip.Group>

            {/* Reply restriction */}
            {showReplyControl && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  render={
                    <Button
                      type="button"
                      variant="transparent"
                      size="sm"
                      iconLeft={<ReplyIcon className="size-4" />}
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
                        onClick={() => onSetReplyRestriction(opt.value)}
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
