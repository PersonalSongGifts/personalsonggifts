import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft } from "lucide-react";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        
        <h1 className="text-2xl font-serif text-foreground">
          You've been unsubscribed
        </h1>
        
        <p className="text-muted-foreground">
          {email ? (
            <>
              <span className="font-medium text-foreground">{email}</span> has been removed from our mailing list.
            </>
          ) : (
            "Your email has been removed from our mailing list."
          )}
        </p>
        
        <p className="text-sm text-muted-foreground">
          You won't receive any more promotional emails from Personal Song Gifts. 
          Note: You'll still receive essential transactional emails related to any orders you place.
        </p>
        
        <Button asChild variant="outline" className="mt-6">
          <a href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Home
          </a>
        </Button>
        
        <p className="text-xs text-muted-foreground pt-4">
          Changed your mind?{" "}
          <a href="mailto:support@personalsonggifts.com" className="text-primary hover:underline">
            Contact us
          </a>{" "}
          to resubscribe.
        </p>
      </div>
    </div>
  );
};

export default Unsubscribe;
