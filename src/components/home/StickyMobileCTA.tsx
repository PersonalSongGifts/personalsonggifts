import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/amplitudeTrack";

const StickyMobileCTA = () => {
  const { pathname } = useLocation();

  // Only render on the homepage
  if (pathname !== "/") return null;

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-elevated px-4 pt-3"
      style={{ paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom))` }}
    >
      <Button
        asChild
        size="lg"
        className="w-full text-base font-semibold py-5"
        onClick={() => trackEvent("Sticky CTA Clicked", { location: "mobile_bottom_bar" })}
      >
        <Link to="/create">Create your song →</Link>
      </Button>
    </div>
  );
};

export default StickyMobileCTA;
