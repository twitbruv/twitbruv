import { XMarkIcon } from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LEN,
} from "@workspace/validators"
import type { PollState } from "./types"
import { POLL_DURATION_CHOICES } from "./types"

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
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-neutral p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-tertiary">Poll</span>
        <Button
          type="button"
          variant="transparent"
          size="sm"
          onClick={onRemove}
          className="text-xs text-tertiary"
        >
          Remove
        </Button>
      </div>
      {poll.options.map((opt, idx) => (
        <div key={opt.id} className="flex items-center gap-2">
          <Input
            value={opt.value}
            onChange={(e) => onUpdateOption(opt.id, e.target.value)}
            placeholder={`Choice ${idx + 1}`}
            maxLength={POLL_OPTION_MAX_LEN}
            className="flex-1"
          />
          {poll.options.length > POLL_MIN_OPTIONS && (
            <Button
              type="button"
              variant="transparent"
              size="sm"
              onClick={() => onRemoveOption(opt.id)}
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
          onClick={onAddOption}
          className="w-fit text-xs"
        >
          Add choice
        </Button>
      )}
      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Label className="shrink-0 text-xs text-tertiary">Duration</Label>
          <Select
            value={String(poll.durationMinutes)}
            onValueChange={(v) => onSetDuration(Number(v))}
          >
            <SelectTrigger size="sm" className="h-8 flex-1" />
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
            checked={poll.allowMultiple}
            onCheckedChange={onSetAllowMultiple}
          />
          <Label className="text-xs text-tertiary">Multiple choice</Label>
        </div>
      </div>
    </div>
  )
}
