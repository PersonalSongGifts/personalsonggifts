import { Link } from "react-router-dom";
import { Heart, Mail } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-secondary border-t border-border">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link 
              to="/" 
              className="font-display text-xl font-semibold text-foreground tracking-tight"
            >
              PersonalSongGifts
            </Link>
            <p className="mt-4 text-muted-foreground text-body max-w-md">
              Turn your love story into a song they'll treasure forever. 
              Each song is a unique piece of emotional art, crafted from your words and memories.
            </p>
            <div className="mt-6 flex items-center gap-2 text-muted-foreground">
              <Mail className="h-5 w-5" />
              <a 
                href="mailto:hello@personalsonggifts.com" 
                className="hover:text-primary transition-colors"
              >
                hello@personalsonggifts.com
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Quick Links</h4>
            <ul className="space-y-3">
              <li>
                <a href="/#how-it-works" className="text-muted-foreground hover:text-primary transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="/#occasions" className="text-muted-foreground hover:text-primary transition-colors">
                  Occasions
                </a>
              </li>
              <li>
                <a href="/#reviews" className="text-muted-foreground hover:text-primary transition-colors">
                  Reviews
                </a>
              </li>
              <li>
                <a href="/#faq" className="text-muted-foreground hover:text-primary transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Legal</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/refund" className="text-muted-foreground hover:text-primary transition-colors">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            © {currentYear} PersonalSongGifts. All rights reserved.
          </p>
          <p className="text-muted-foreground text-sm flex items-center gap-1">
            Made with <Heart className="h-4 w-4 text-destructive fill-current" /> for meaningful moments
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
