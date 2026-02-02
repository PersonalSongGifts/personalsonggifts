import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface ScheduledDeliveryPickerProps {
  expectedDelivery: string | null;
  value: Date | null;
  onChange: (date: Date | null) => void;
}

type RecommendedTimeResult = {
  time: Date;
  type: "recommended" | "suggested" | "overdue";
  label: string;
  sublabel: string;
} | null;

// Convert UTC date to PST Date object
function toPST(date: Date): Date {
  return new Date(
    date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
}

// Format a date to display in PST
function formatPST(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " PST";
}

// Get recommended time with smart fallback logic
function getRecommendedTime(expectedDelivery: string | null): RecommendedTimeResult {
  if (!expectedDelivery) return null;
  
  const now = new Date();
  const expected = new Date(expectedDelivery);
  const idealRecommended = new Date(expected.getTime() - 12 * 60 * 60 * 1000);
  
  // If 12 hours before expected delivery is still in the future - optimal case
  if (idealRecommended > now) {
    return {
      time: idealRecommended,
      type: "recommended",
      label: "Recommended",
      sublabel: "12 hours before expected delivery"
    };
  }
  
  // If expected delivery itself has passed - overdue
  if (expected <= now) {
    const overdueTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
    return {
      time: overdueTime,
      type: "overdue",
      label: "Overdue",
      sublabel: "Expected delivery has passed - send immediately"
    };
  }
  
  // Expected delivery is still in future but ideal recommended time has passed
  const suggestedTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
  return {
    time: suggestedTime,
    type: "suggested",
    label: "Suggested",
    sublabel: "Delivery due soon - send ASAP"
  };
}

// Generate hour options (1-12 AM/PM)
function generateHourOptions() {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    hours.push({
      value: h.toString(),
      label: `${hour12} ${ampm}`,
    });
  }
  return hours;
}

// Generate minute options (00, 15, 30, 45)
function generateMinuteOptions() {
  return [
    { value: "0", label: "00" },
    { value: "15", label: "15" },
    { value: "30", label: "30" },
    { value: "45", label: "45" },
  ];
}

export function ScheduledDeliveryPicker({
  expectedDelivery,
  value,
  onChange,
}: ScheduledDeliveryPickerProps) {
  const [mode, setMode] = useState<"now" | "recommended" | "custom">("now");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedHour, setSelectedHour] = useState<string>("9");
  const [selectedMinute, setSelectedMinute] = useState<string>("0");

  const recommendedResult = getRecommendedTime(expectedDelivery);
  const hourOptions = generateHourOptions();
  const minuteOptions = generateMinuteOptions();

  // Build custom datetime from selections (in PST, convert to UTC for storage)
  useEffect(() => {
    if (mode === "now") {
      onChange(null);
    } else if (mode === "recommended" && recommendedResult) {
      onChange(recommendedResult.time);
    } else if (mode === "custom" && selectedDate) {
      // Create a date string in PST, then parse to get UTC
      const pstDateStr = `${format(selectedDate, "yyyy-MM-dd")}T${selectedHour.padStart(2, "0")}:${selectedMinute.padStart(2, "0")}:00`;
      
      // Parse as PST and convert to UTC
      const pstDate = new Date(pstDateStr + " PST");
      
      // Validate it's in the future
      if (pstDate > new Date()) {
        onChange(pstDate);
      } else {
        onChange(null);
      }
    }
  }, [mode, selectedDate, selectedHour, selectedMinute, recommendedResult]);

  // Initialize custom date/time from value
  useEffect(() => {
    if (value && mode === "custom") {
      const pstDate = toPST(value);
      setSelectedDate(pstDate);
      setSelectedHour(pstDate.getHours().toString());
      const mins = pstDate.getMinutes();
      // Round to nearest 15
      const roundedMins = Math.round(mins / 15) * 15;
      setSelectedMinute((roundedMins % 60).toString());
    }
  }, [value, mode]);

  // Get icon and color based on recommendation type
  const getRecommendedIcon = () => {
    if (!recommendedResult) return null;
    switch (recommendedResult.type) {
      case "recommended":
        return <Sparkles className="h-3 w-3 text-amber-500" />;
      case "suggested":
        return <Clock className="h-3 w-3 text-blue-500" />;
      case "overdue":
        return <AlertTriangle className="h-3 w-3 text-red-500" />;
    }
  };

  const getRecommendedTextColor = () => {
    if (!recommendedResult) return "";
    switch (recommendedResult.type) {
      case "recommended":
        return "text-amber-600";
      case "suggested":
        return "text-blue-600";
      case "overdue":
        return "text-red-600";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-medium text-sm">Delivery Timing</h4>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as "now" | "recommended" | "custom")}
        className="space-y-3"
      >
        <div className="flex items-start space-x-3">
          <RadioGroupItem value="now" id="delivery-now" />
          <Label htmlFor="delivery-now" className="font-normal cursor-pointer">
            <span className="font-medium">Send Now</span>
            <p className="text-sm text-muted-foreground">
              Deliver immediately when you click the button
            </p>
          </Label>
        </div>

        {recommendedResult && (
          <div className="flex items-start space-x-3">
            <RadioGroupItem value="recommended" id="delivery-recommended" />
            <Label htmlFor="delivery-recommended" className="font-normal cursor-pointer">
              <div className="flex items-center gap-2">
                <span className={cn("font-medium", getRecommendedTextColor())}>
                  {recommendedResult.label}
                </span>
                {getRecommendedIcon()}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatPST(recommendedResult.time)}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {recommendedResult.sublabel}
              </p>
            </Label>
          </div>
        )}

        <div className="flex items-start space-x-3">
          <RadioGroupItem value="custom" id="delivery-custom" />
          <Label htmlFor="delivery-custom" className="font-normal cursor-pointer">
            <span className="font-medium">Schedule for Later</span>
            <p className="text-sm text-muted-foreground">
              Choose a specific date and time (PST)
            </p>
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

          {value && (
            <p className="text-sm text-green-600">
              ✓ Will send: {formatPST(value)}
            </p>
          )}
          
          {mode === "custom" && selectedDate && !value && (
            <p className="text-sm text-amber-600">
              ⚠ Selected time is in the past
            </p>
          )}
        </div>
      )}

      {mode === "recommended" && value && (
        <p className="text-sm text-green-600 pl-6">
          ✓ Will send: {formatPST(value)}
        </p>
      )}
    </div>
  );
}
