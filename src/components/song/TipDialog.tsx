import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface TipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
}

const PRESETS = [500, 1000, 2000]; // $5, $10, $20

export default function TipDialog({ open, onOpenChange, orderId }: TipDialogProps) {
  const [selected, setSelected] = useState<number | "custom">(1000);
  const [customDollars, setCustomDollars] = useState("");
  const [loading, setLoading] = useState(false);

  const resolveAmountCents = (): number | null => {
    if (selected === "custom") {
      const dollars = parseFloat(customDollars);
      if (!Number.isFinite(dollars) || dollars < 1) return null;
      if (dollars > 500) return null;
      return Math.round(dollars * 100);
    }
    return selected;
  };

  const handleSubmit = async () => {
    const amountCents = resolveAmountCents();
    if (!amountCents) {
      toast.error("Please enter an amount between $1 and $500");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-tip-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, amountCents }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start tip checkout");
      }
      window.open(data.url, "_blank");
      onOpenChange(false);
    } catch (err) {
      console.error("Tip checkout failed:", err);
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Heart className="h-6 w-6 text-primary fill-primary/20" />
            Loved your song?
          </DialogTitle>
          <DialogDescription className="text-base pt-1">
            Leave a tip for the small team who crafted it and help us keep making songs like this.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 pt-2">
          {PRESETS.map((cents) => (
            <Button
              key={cents}
              type="button"
              variant={selected === cents ? "default" : "outline"}
              onClick={() => { setSelected(cents); setCustomDollars(""); }}
              className="h-12 text-lg"
            >
              ${cents / 100}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setSelected("custom")}
            className={`w-full text-left text-sm font-medium ${selected === "custom" ? "text-primary" : "text-muted-foreground"}`}
          >
            Or choose your own amount
          </button>
          {selected === "custom" && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                max={500}
                step={1}
                placeholder="25"
                value={customDollars}
                onChange={(e) => setCustomDollars(e.target.value)}
                className="pl-7 h-12 text-lg"
                autoFocus
              />
            </div>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading}
          size="lg"
          className="w-full mt-2 gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Heart className="h-4 w-4" />
          )}
          Send a tip →
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Secure checkout powered by Stripe. USD.
        </p>
      </DialogContent>
    </Dialog>
  );
}