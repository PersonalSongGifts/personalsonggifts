import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check, Music } from "lucide-react";
import Layout from "@/components/layout/Layout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Testimonials from "@/components/home/Testimonials";
import HowItWorks from "@/components/home/HowItWorks";
import FinalCTA from "@/components/home/FinalCTA";
import StickyMobileCTA from "@/components/home/StickyMobileCTA";
import SampleSongCard from "@/components/home/SampleSongCard";
import { landingPageBySlug, landingPages } from "@/data/landingPages";
import { sampleSongById } from "@/data/sampleSongs";
import NotFound from "./NotFound";

const SITE_URL = "https://www.personalsonggifts.com";

const CustomSongLanding = () => {
  const { slug } = useParams<{ slug: string }>();
  const page = slug ? landingPageBySlug(slug) : undefined;

  if (!page) return <NotFound />;

  const canonical = `${SITE_URL}/custom-song/${page.slug}`;
  const createLink = `/create?occasion=${page.createParam}`;
  const songs = page.sampleIds.map(sampleSongById).filter(Boolean);
  const related = page.related
    .map((s) => landingPageBySlug(s))
    .filter((p): p is (typeof landingPages)[number] => Boolean(p));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Custom Songs", item: `${SITE_URL}/custom-song` },
      { "@type": "ListItem", position: 3, name: page.h1, item: canonical },
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Custom personalized song",
    description: page.description,
    brand: { "@type": "Brand", name: "PersonalSongGifts" },
    offers: {
      "@type": "Offer",
      price: "29.00",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: canonical,
    },
  };

  return (
    <Layout>
      <SEO title={page.title} description={page.description} path={`/custom-song/${page.slug}`} />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqLd)}</script>
        <script type="application/ld+json">{JSON.stringify(productLd)}</script>
      </Helmet>

      {/* Hero */}
      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-sm md:text-base font-medium text-primary mb-4">
              Custom songs · from $29 · delivered within 24 hours
            </p>
            <h1 className="font-display text-foreground mb-4 md:mb-6 text-3xl md:text-4xl lg:text-5xl">
              {page.h1}
            </h1>
            {page.intro.map((p, i) => (
              <p key={i} className="text-body-lg text-muted-foreground mb-4 text-base md:text-lg">
                {p}
              </p>
            ))}

            <div className="mt-6 md:mt-8">
              <Button
                asChild
                size="lg"
                className="text-base md:text-lg px-8 md:px-10 py-5 md:py-6 font-semibold shadow-elevated w-full sm:w-auto"
              >
                <Link to={createLink}>Create Your Song</Link>
              </Button>
            </div>

            <p className="mt-6 text-xs md:text-sm text-muted-foreground">
              ✓{" "}
              <Link
                to="/refund"
                className="underline decoration-muted-foreground/40 hover:text-primary hover:decoration-primary"
              >
                Love it or your money back — 14-day guarantee
              </Link>{" "}
              · ✓ Delivered within 24 hours · ✓ 100% unique
            </p>
          </div>
        </div>
      </section>

      {/* Samples */}
      {songs.length > 0 && (
        <section className="py-10 md:py-16 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="font-display text-foreground mb-4">Hear what it sounds like</h2>
              <p className="text-body text-muted-foreground max-w-2xl mx-auto">
                Every song is unique, crafted from real stories shared by people just like you.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
              {songs.map((song) => (
                <SampleSongCard key={song!.id} song={song!} />
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8">
              <Music className="inline h-4 w-4 mr-1" />
              These are samples — your song will be created just for your loved one
            </p>
          </div>
        </section>
      )}

      {/* Sections */}
      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-10 md:space-y-14">
            {page.sections.map((section, i) => (
              <div key={i}>
                <h2 className="font-display text-foreground mb-4 text-2xl md:text-3xl">
                  {section.heading}
                </h2>
                {section.paragraphs?.map((p, j) => (
                  <p key={j} className="text-body text-muted-foreground mb-4">
                    {p}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="space-y-3">
                    {section.bullets.map((b, j) => (
                      <li key={j} className="flex gap-3 text-body text-muted-foreground">
                        <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Testimonials />
      <HowItWorks />

      {/* Story prompts */}
      <section className="py-10 md:py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-foreground mb-6 text-center text-2xl md:text-3xl">
              What to tell us about them
            </h2>
            <ul className="space-y-3">
              {page.storyPrompts.map((prompt, i) => (
                <li key={i} className="flex gap-3 text-body text-muted-foreground">
                  <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>{prompt}</span>
                </li>
              ))}
            </ul>
            <div className="text-center mt-10">
              <Button asChild size="lg" className="text-lg px-8 py-6">
                <Link to={createLink}>Start your song</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="font-display text-foreground mb-3 md:mb-4">Questions people ask</h2>
          </div>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {page.faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="bg-card rounded-lg border border-border px-6 data-[state=open]:shadow-soft"
                >
                  <AccordionTrigger className="text-left text-lg font-medium hover:no-underline py-5">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-body pb-5">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-10 md:py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-foreground mb-6 text-2xl md:text-3xl">
              More custom songs
            </h2>
            <ul className="space-y-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    to={`/custom-song/${r.slug}`}
                    className="text-primary hover:underline text-body"
                  >
                    {r.h1}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/custom-song" className="text-primary hover:underline text-body font-medium">
                  All custom songs
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <FinalCTA />
      <StickyMobileCTA />
    </Layout>
  );
};

export default CustomSongLanding;
