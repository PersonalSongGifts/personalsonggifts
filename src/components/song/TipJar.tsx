import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TipDialog from "./TipDialog";

interface TipJarProps {
  orderId: string;
  recipientName?: string;
  customerName?: string;
}

const thankedKey = (orderId: string) => `tip_thanked_${orderId}`;

export default function TipJar({ orderId, customerName }: TipJarProps) {
  const [open, setOpen] = useState(false);
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setThanked(window.sessionStorage.getItem(thankedKey(orderId)) === "1");
    const onStorage = () => {
      setThanked(window.sessionStorage.getItem(thankedKey(orderId)) === "1");
    };
    // Custom event so the same-tab verify flow can re-trigger
    window.addEventListener("tip-thanked", onStorage);
    return () => window.removeEventListener("tip-thanked", onStorage);
  }, [orderId]);

  const firstName = (customerName || "").split(" ")[0];

  if (thanked) {
    return (
      <Card className="mb-8 border-primary/30 bg-[hsl(35,40%,97%)]">
        <CardContent className="p-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Heart className="h-6 w-6 text-primary fill-primary" />
            <h3 className="text-xl font-semibold text-primary">
              Thank you{firstName ? `, ${firstName}` : ""}. 💛
            </h3>
          </div>
          <p className="text-foreground/80 max-w-md mx-auto">
            Your tip just made our week. We'll keep crafting songs because of people like you.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Leave another tip
            </button>
          </div>
        </CardContent>
        <TipDialog open={open} onOpenChange={setOpen} orderId={orderId} />
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-8 border-primary/20 bg-[hsl(35,40%,97%)]">
        <CardContent className="p-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Heart className="h-5 w-5 text-primary fill-primary/20" />
            <h3 className="text-xl font-semibold text-primary">Loved it? Tip the studio team</h3>
          </div>
          <p className="text-foreground/80 max-w-md mx-auto">
            A small thank-you goes a long way — it keeps our songwriters writing.
          </p>
          <div className="flex justify-center gap-2 flex-wrap pt-2">
            <Button variant="outline" onClick={() => setOpen(true)} className="min-w-[72px]">$5</Button>
            <Button variant="outline" onClick={() => setOpen(true)} className="min-w-[72px]">$10</Button>
            <Button variant="outline" onClick={() => setOpen(true)} className="min-w-[72px]">$20</Button>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Heart className="h-4 w-4" />
              Leave a tip
            </Button>
          </div>
        </CardContent>
      </Card>
      <TipDialog open={open} onOpenChange={setOpen} orderId={orderId} />
    </>
  );
}