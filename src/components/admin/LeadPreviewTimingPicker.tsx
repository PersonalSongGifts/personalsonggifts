import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type LeadPreviewTimingMode = "send_now" | "auto_24h" | "custom" | "paused";

interface LeadPreviewTimingPickerProps {
  mode: LeadPreviewTimingMode;
  onModeChange: (mode: LeadPreviewTimingMode) => void;
  scheduledAt: Date | null;
  onScheduledAtChange: (date: Date | null) => void;
}

function toPST(date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
}

function formatPST(date: Date): string {
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " PST"
  );
}

function generateHourOptions() {
  const hours: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    hours.push({ value: h.toString(), label: `${hour12} ${ampm}` });
  }
  return hours;
}

function generateMinuteOptions() {
  return [
    { value: "0", label: "00" },
    { value: "15", label: "15" },
    { value: "30", label: "30" },
    { value: "45", label: "45" },
  ];
}

export function LeadPreviewTimingPicker({
  mode,
  onModeChange,
  scheduledAt,
  onScheduledAtChange,
}: LeadPreviewTimingPickerProps) {
  const hourOptions = useMemo(() => generateHourOptions(), []);
  const minuteOptions = useMemo(() => generateMinuteOptions(), []);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedHour, setSelectedHour] = useState<string>("9");
  const [selectedMinute, setSelectedMinute] = useState<string>("0");

  // Keep local (custom) controls in sync with saved scheduledAt
  useEffect(() => {
    if (!scheduledAt || mode !== "custom") return;
    const pst = toPST(scheduledAt);
    setSelectedDate(pst);
    setSelectedHour(pst.getHours().toString());
    const mins = pst.getMinutes();
    const rounded = Math.round(mins / 15) * 15;
    setSelectedMinute((rounded % 60).toString());
  }, [scheduledAt, mode]);

  // Auto mode: ensure scheduledAt exists
  useEffect(() => {
    if (mode !== "auto_24h") return;
    if (scheduledAt) return;
    onScheduledAtChange(new Date(Date.now() + 24 * 60 * 60 * 1000));
  }, [mode, scheduledAt, onScheduledAtChange]);

  // Custom mode: build datetime from selection
  useEffect(() => {
    if (mode !== "custom") return;
    if (!selectedDate) {
      onScheduledAtChange(null);
      return;
    }

    const pstDateStr = `${format(selectedDate, "yyyy-MM-dd")}T${selectedHour.padStart(2, "0")}:${selectedMinute.padStart(2, "0")}:00`;
    const pstDate = new Date(pstDateStr + " PST");
    if (pstDate > new Date()) {
      onScheduledAtChange(pstDate);
    } else {
      onScheduledAtChange(null);
    }
  }, [mode, selectedDate, selectedHour, selectedMinute, onScheduledAtChange]);

  const autoSendLabel = scheduledAt ? formatPST(scheduledAt) : "~24 hours after upload";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-medium text-sm">Preview Email Timing</h4>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => onModeChange(v as LeadPreviewTimingMode)}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3">
          <RadioGroupItem value="send_now" id="lead-preview-now" />
          <Label htmlFor="lead-preview-now" className="font-normal cursor-pointer">
            <span className="font-medium">Send Now</span>
            <p className="text-sm text-muted-foreground">Send the lead preview email immediately</p>
          </Label>
        </div>

        <div className="flex items-start space-x-3">
          <RadioGroupItem value="auto_24h" id="lead-preview-auto" />
          <Label htmlFor="lead-preview-auto" className="font-normal cursor-pointer">
            <span className="font-medium">Auto-send (24 hours)</span>
            <p className="text-sm text-muted-foreground">{autoSendLabel}</p>
            <p className="text-xs text-muted-foreground">(Do nothing and it will go out on its own)</p>
          </Label>
        </div>

        <div className="flex items-start space-x-3">
          <RadioGroupItem value="custom" id="lead-preview-custom" />
          <Label htmlFor="lead-preview-custom" className="font-normal cursor-pointer">
            <span className="font-medium">Schedule for Later</span>
            <p className="text-sm text-muted-foreground">Choose a specific date and time (PST)</p>
          </Label>
        </div>

        <div className="flex items-start space-x-3">
          <RadioGroupItem value="paused" id="lead-preview-paused" />
          <Label htmlFor="lead-preview-paused" className="font-normal cursor-pointer">
            <span className="font-medium">Cancel / Pause</span>
            <p className="text-sm text-muted-foreground">Do not auto-send (you can send later)</p>
          </Label>
        </div>
      </RadioGroup>

      {mode === "custom" && (
        <div className="pl-6 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex flex-wrap gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today;
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            <Select value={selectedHour} onValueChange={setSelectedHour}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                {hourOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedMinute} onValueChange={setSelectedMinute}>
              <SelectTrigger className="w-[80px]">
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent>
                {minuteOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    :{opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="self-center text-sm text-muted-foreground">PST</span>
          </div>

          {scheduledAt ? (
            <p className="text-sm text-muted-foreground">
              Scheduled: <span className="font-medium">{formatPST(scheduledAt)}</span>
            </p>
          ) : selectedDate ? (
            <p className="text-sm text-muted-foreground">
              Selected time must be in the future.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
