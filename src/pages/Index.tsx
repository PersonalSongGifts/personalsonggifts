import Layout from "@/components/layout/Layout";
import HeroSection from "@/components/home/HeroSection";
import SamplePlayer from "@/components/home/SamplePlayer";
import TrustStrip from "@/components/home/TrustStrip";
import HowItWorks from "@/components/home/HowItWorks";
import OccasionsGrid from "@/components/home/OccasionsGrid";
import Testimonials from "@/components/home/Testimonials";
import FAQSection from "@/components/home/FAQSection";
import FinalCTA from "@/components/home/FinalCTA";
import { useUtmCapture } from "@/hooks/useUtmCapture";

const Index = () => {
  // Capture UTM parameters on landing page
  useUtmCapture();
  return (
    <Layout>
      <HeroSection />
      <Testimonials />
      <SamplePlayer />
      <TrustStrip />
      <HowItWorks />
      <OccasionsGrid />
      <FAQSection />
      <FinalCTA />
    </Layout>
  );
};

export default Index;
