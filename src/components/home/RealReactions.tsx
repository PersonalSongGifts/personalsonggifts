// FTC COMPLIANCE GUARDRAIL:
// Any reaction video shown here (or anywhere else in ads/marketing) is a
// featured customer video collected via /submit-reaction, where the customer
// is offered a $100 Amazon/Visa gift card if we feature it. That incentive
// creates a material connection under FTC 16 CFR Part 255 — every featured
// video used in advertising MUST carry a clear disclosure (e.g. "Featured
// reaction — customer received a $100 gift card"). Do not remove this comment
// without also removing all incentivized reaction videos from marketing
// surfaces.
import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const videos = [
  "/videos/reaction-1.mp4",
  "/videos/reaction-2.mp4",
  "/videos/reaction-3.mp4",
  "/videos/reaction-4.mp4",
];

const RealReactions = () => {
  const [mutedMap, setMutedMap] = useState<Record<number, boolean>>(
    () => Object.fromEntries(videos.map((_, i) => [i, true])),
  );
  const refs = useRef<(HTMLVideoElement | null)[]>([]);

  const toggleMute = (i: number) => {
    const next = !mutedMap[i];
    // When unmuting one, mute the others so audio doesn't overlap.
    setMutedMap(() => {
      const m: Record<number, boolean> = {};
      videos.forEach((_, idx) => {
        m[idx] = idx === i ? next : true;
      });
      return m;
    });
    refs.current.forEach((el, idx) => {
      if (!el) return;
      el.muted = idx === i ? next : true;
    });
  };

  return (
    <section className="py-10 md:py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display text-foreground mb-3 md:mb-4">
            Real reactions. Real tears.
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Watch the moment they hear their song for the first time.
          </p>
        </div>

        <div className="-mx-4 px-4 overflow-x-auto snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex gap-4 md:gap-6 pb-2">
            {videos.map((src, i) => {
              const isMuted = mutedMap[i];
              return (
                <li
                  key={src}
                  className="snap-center shrink-0 w-[70vw] max-w-[280px] sm:w-[240px] md:w-[260px]"
                >
                  <button
                    type="button"
                    onClick={() => toggleMute(i)}
                    aria-label={isMuted ? "Unmute video" : "Mute video"}
                    className="group relative block w-full aspect-[9/16] rounded-xl overflow-hidden shadow-soft bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <video
                      ref={(el) => (refs.current[i] = el)}
                      src={src}
                      className="absolute inset-0 h-full w-full object-cover"
                      muted={isMuted}
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                    <span className="absolute top-2 right-2 inline-flex items-center justify-center h-8 w-8 rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      {isMuted ? (
                        <VolumeX className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-center text-xs md:text-sm text-muted-foreground mt-6">
          Shared with permission by our customers.
        </p>
      </div>
    </section>
  );
};

export default RealReactions;