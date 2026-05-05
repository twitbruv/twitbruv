import { XMarkIcon } from "@heroicons/react/16/solid"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LEN,
} from "@workspace/validators"
import { POLL_DURATION_CHOICES } from "./types"
import type { PollState } from "./types"

/** Base UI Select uses `items` so SelectValue shows labels; otherwise it stringifies the raw value (e.g. "4320"). */
const POLL_DURATION_SELECT_ITEMS = POLL_DURATION_CHOICES.map((c) => ({
  value: String(c.minutes),
  label: c.label,
}))

interface ComposePollProps {
  poll: PollState
  onRemove: () => void
  onAddOption: () => void
  onUpdateOption: (id: string, value: string) => void
  onRemoveOption: (id: string) => void
  onSetDuration: (minutes: number) => void
  onSetAllowMultiple: (value: boolean) => void
}

export function ComposePoll({
  poll,
  onRemove,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onSetDuration,
  onSetAllowMultiple,
}: ComposePollProps) {
  return (
    <div className="mt-3 flex flex-col gap-1 rounded-xl border border-neutral bg-subtle p-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-sm font-medium text-tertiary">Poll</span>
        <Button
          type="button"
          variant="transparent"
          size="sm"
          onClick={onRemove}
          aria-label="Remove poll"
          iconLeft={<XMarkIcon className="size-4" />}
        />
      </div>
      <div className="flex flex-col gap-2 rounded-lg bg-base-2 p-2 shadow-sm">
        {poll.options.map((opt, idx) => (
          <div key={opt.id} className="flex items-center gap-2">
            <Input
              value={opt.value}
              onChange={(e) => onUpdateOption(opt.id, e.target.value)}
              placeholder={`Choice ${idx + 1}`}
              maxLength={POLL_OPTION_MAX_LEN}
              className="flex-1 border border-neutral shadow-none"
            />
            {poll.options.length > POLL_MIN_OPTIONS && (
              <Button
                type="button"
                variant="transparent"
                size="sm"
                onClick={() => onRemoveOption(opt.id)}
                aria-label="Remove choice"
                iconLeft={<XMarkIcon className="size-4" />}
                className="shrink-0"
              />
            )}
          </div>
        ))}
        {poll.options.length < POLL_MAX_OPTIONS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddOption}
          >
            Add choice
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-sm text-tertiary">Duration</Label>
          <Select
            value={String(poll.durationMinutes)}
            onValueChange={(v) => onSetDuration(Number(v))}
            items={POLL_DURATION_SELECT_ITEMS}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              {POLL_DURATION_CHOICES.map((c) => (
                <SelectItem key={c.minutes} value={String(c.minutes)}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="poll-allow-multiple"
            checked={poll.allowMultiple}
            onCheckedChange={onSetAllowMultiple}
          />
          <Label
            htmlFor="poll-allow-multiple"
            className="cursor-pointer text-sm text-tertiary"
          >
            Multiple choice
          </Label>
        </div>
      </div>
    </div>
  )
}
