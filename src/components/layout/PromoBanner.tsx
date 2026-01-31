import { useState } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";

const PromoBanner = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-primary text-primary-foreground py-2.5 px-4 relative">
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm md:text-base">
        <span className="font-medium">
          💘 Valentine's Day Special – 50% Off! Hurry, Limited Time Offer!
        </span>
        <Link 
          to="/create" 
          className="underline underline-offset-2 hover:no-underline font-semibold ml-1"
        >
          Create Your Song →
        </Link>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-primary-foreground/10 rounded-full transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default PromoBanner;
