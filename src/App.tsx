import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { ActivePromoProvider } from "./hooks/useActivePromo";
import SEO from "./components/SEO";
import Index from "./pages/Index";
import CreateSong from "./pages/CreateSong";
import Checkout from "./pages/Checkout";
import PaymentSuccess from "./pages/PaymentSuccess";
import Confirmation from "./pages/Confirmation";
import SongPlayer from "./pages/SongPlayer";
import SongPreview from "./pages/SongPreview";

// Code-split: heavy or rarely visited routes
const Admin = lazy(() => import("./pages/Admin"));
const CoverStudio = lazy(() => import("./pages/CoverStudio"));
const Keepsake = lazy(() => import("./pages/Keepsake"));
const SubmitReaction = lazy(() => import("./pages/SubmitReaction"));
const ShareReaction = lazy(() => import("./pages/ShareReaction"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const SongRevision = lazy(() => import("./pages/SongRevision"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const CustomSongHub = lazy(() => import("./pages/CustomSongHub"));
const CustomSongLanding = lazy(() => import("./pages/CustomSongLanding"));
const NotFound = lazy(() => import("./pages/NotFound"));


const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ActivePromoProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <SEO
                  title="Custom Songs From Your Story | PersonalSongGifts"
                  description="A personalized custom song written from your memories — the gift they'll never forget. From $29, delivered within 24 hours. Anniversaries, birthdays, memorials and more."
                  path="/"
                />
                <Index />
              </>
            }
          />
          <Route
            path="/create"
            element={
              <>
                <SEO
                  title="Create Your Custom Song | From $29, Delivered in 24 Hours"
                  description="Tell us about your loved one and we'll craft a one-of-a-kind personalized song. Hear a preview first — pay only when you love it."
                  path="/create"
                />
                <CreateSong />
              </>
            }
          />
          <Route
            path="/checkout"
            element={
              <>
                <SEO title="Checkout | PersonalSongGifts" noindex />
                <Checkout />
              </>
            }
          />
          <Route
            path="/payment-success"
            element={
              <>
                <SEO title="Payment Received | PersonalSongGifts" noindex />
                <PaymentSuccess />
              </>
            }
          />
          <Route
            path="/confirmation"
            element={
              <>
                <SEO title="Order Confirmed | PersonalSongGifts" noindex />
                <Confirmation />
              </>
            }
          />
          <Route
            path="/admin"
            element={
              <>
                <SEO title="Admin | PersonalSongGifts" noindex />
                <Admin />
              </>
            }
          />
          <Route
            path="/song/:orderId"
            element={
              <>
                <SEO title="Your Song | PersonalSongGifts" noindex />
                <SongPlayer />
              </>
            }
          />
          <Route
            path="/keepsake/:id"
            element={
              <>
                <SEO title="Your Keepsake | PersonalSongGifts" noindex />
                <Keepsake />
              </>
            }
          />
          <Route
            path="/cover-studio/:orderId"
            element={
              <>
                <SEO title="Cover Studio | PersonalSongGifts" noindex />
                <CoverStudio />
              </>
            }
          />
          <Route
            path="/preview/:token"
            element={
              <>
                <SEO title="Your Song Preview | PersonalSongGifts" noindex />
                <SongPreview />
              </>
            }
          />
          <Route
            path="/submit-reaction"
            element={
              <>
                <SEO title="Share Your Reaction | PersonalSongGifts" noindex />
                <SubmitReaction />
              </>
            }
          />
          <Route
            path="/song/revision/:token"
            element={
              <>
                <SEO title="Song Revision | PersonalSongGifts" noindex />
                <SongRevision />
              </>
            }
          />
          <Route
            path="/share-reaction"
            element={
              <>
                <SEO title="Reaction | PersonalSongGifts" noindex />
                <ShareReaction />
              </>
            }
          />
          <Route
            path="/unsubscribe"
            element={
              <>
                <SEO title="Email Preferences | PersonalSongGifts" noindex />
                <Unsubscribe />
              </>
            }
          />
          <Route
            path="/privacy"
            element={
              <>
                <SEO
                  title="Privacy Policy | PersonalSongGifts"
                  description="How PersonalSongGifts collects, uses and protects the information you share when ordering a custom song."
                  path="/privacy"
                />
                <PrivacyPolicy />
              </>
            }
          />
          <Route
            path="/terms"
            element={
              <>
                <SEO
                  title="Terms of Service | PersonalSongGifts"
                  description="The terms that apply when you order a custom song from PersonalSongGifts."
                  path="/terms"
                />
                <TermsOfService />
              </>
            }
          />
          <Route
            path="/refund"
            element={
              <>
                <SEO
                  title="Refund Policy | PersonalSongGifts"
                  description="Our remake and refund policy for custom songs ordered from PersonalSongGifts."
                  path="/refund"
                />
                <RefundPolicy />
              </>
            }
          />
          <Route path="/custom-song" element={<CustomSongHub />} />
          <Route path="/custom-song/:slug" element={<CustomSongLanding />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}

          <Route
            path="*"
            element={
              <>
                <SEO title="Page Not Found | PersonalSongGifts" noindex />
                <NotFound />
              </>
            }
          />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </ActivePromoProvider>
  </QueryClientProvider>
);

export default App;
