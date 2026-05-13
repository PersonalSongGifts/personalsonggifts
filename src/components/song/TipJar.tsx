import { useState } from "react";
import { Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TipDialog from "./TipDialog";

interface TipJarProps {
  orderId: string;
}

export default function TipJar({ orderId }: TipJarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="mb-8 border-primary/20 bg-[hsl(35,40%,97%)]">
        <CardContent className="p-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Heart className="h-5 w-5 text-primary fill-primary/20" />
            <h3 className="text-xl font-semibold text-primary">Loved your song?</h3>
          </div>
          <p className="text-foreground/80 max-w-md mx-auto">
            Leave a tip for the small team who crafted it and help us keep making songs like this.
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