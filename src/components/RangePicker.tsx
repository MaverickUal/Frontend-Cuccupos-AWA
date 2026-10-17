import { CalendarRange } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RANGE_OPTIONS, resolveRange, toDayInput, addDays, startOfDay, type RangePreset } from "@/lib/stats"

export interface RangeSelection {
  preset: RangePreset
  from: string
  to: string
}

/** Defaults to the last 7 days, which is what the old hard-coded chart used. */
export const defaultSelection = (): RangeSelection => {
  const today = startOfDay(new Date())
  return { preset: "7d", from: toDayInput(today), to: toDayInput(today) }
}

export function useRange(sel: RangeSelection) {
  return resolveRange(sel.preset, sel.from, sel.to)
}

/**
 * Period selector shared by the dashboard chart and the reports page.
 * "Today" switches the chart to hourly buckets; any other preset buckets by day,
 * and "Custom range" exposes from/to pickers so past dates can be inspected.
 */
export function RangePicker({
  value,
  onChange,
  idPrefix = "range",
  className,
}: {
  value: RangeSelection
  onChange: (v: RangeSelection) => void
  idPrefix?: string
  className?: string
}) {
  const today = startOfDay(new Date())
  const range = useRange(value)

  const setPreset = (preset: RangePreset) => {
    // Seed the custom pickers with something sensible so switching to Custom
    // never shows an empty form.
    if (preset === "custom" && (!value.from || !value.to)) {
      onChange({ preset, from: toDayInput(addDays(today, -6)), to: toDayInput(today) })
      return
    }
    onChange({ ...value, preset })
  }

  return (
    <div className={className ?? "flex flex-wrap items-end gap-2"}>
      <div className="w-44 space-y-1.5">
        <Label htmlFor={`${idPrefix}-preset`}>Period</Label>
        <Select value={value.preset} onValueChange={(v) => setPreset(v as RangePreset)}>
          <SelectTrigger id={`${idPrefix}-preset`} aria-label="Report period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-from`} className="flex items-center gap-1">
              <CalendarRange className="size-3.5" /> From
            </Label>
            <Input
              id={`${idPrefix}-from`}
              type="date"
              max={toDayInput(today)}
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="w-[9.5rem]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-to`}>To</Label>
            <Input
              id={`${idPrefix}-to`}
              type="date"
              max={toDayInput(today)}
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="w-[9.5rem]"
            />
          </div>
        </div>
      )}

      <p className="pb-2 text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{range.label}</span>
        {range.hourly ? " · by hour" : " · by day"}
      </p>
    </div>
  )
}