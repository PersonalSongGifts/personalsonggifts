import Layout from "@/components/layout/Layout";
import HeroSection from "@/components/home/HeroSection";
import SamplePlayer from "@/components/home/SamplePlayer";
import TrustStrip from "@/components/home/TrustStrip";
import HowItWorks from "@/components/home/HowItWorks";
import OccasionsGrid from "@/components/home/OccasionsGrid";
import Testimonials from "@/components/home/Testimonials";
import FAQSection from "@/components/home/FAQSection";
import FinalCTA from "@/components/home/FinalCTA";
import StickyMobileCTA from "@/components/home/StickyMobileCTA";
import { useUtmCapture } from "@/hooks/useUtmCapture";

const Index = () => {
  // Capture UTM parameters on landing page
  useUtmCapture();
  return (
    <Layout>
      {/* pb-20 md:pb-0 ensures sticky mobile CTA bar never covers FinalCTA */}
      <div className="pb-20 md:pb-0">
        <HeroSection />
        <SamplePlayer />
        <Testimonials />
        <TrustStrip />
        <HowItWorks />
        <OccasionsGrid />
        <FAQSection />
        <FinalCTA />
      </div>
      <StickyMobileCTA />
    </Layout>
  );
};

export default Index;
