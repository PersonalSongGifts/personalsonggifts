import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO from "@/components/SEO";
import FinalCTA from "@/components/home/FinalCTA";
import { landingPages, type LandingPage } from "@/data/landingPages";

const groups: { heading: string; kind: LandingPage["kind"] }[] = [
  { heading: "By occasion", kind: "occasion" },
  { heading: "By person", kind: "recipient" },
  { heading: "By country", kind: "country" },
];

const CustomSongHub = () => {
  return (
    <Layout>
      <SEO
        title="Custom Songs for Every Occasion, Person and Country | PersonalSongGifts"
        description="Browse personalized custom songs by occasion, by who it's for, and by country. From $29, delivered within 24 hours."
        path="/custom-song"
      />

      <section className="py-10 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-display text-foreground mb-4 md:mb-6 text-3xl md:text-4xl lg:text-5xl">
              Custom songs for every occasion, person and country
            </h1>
            <p className="text-body-lg text-muted-foreground text-base md:text-lg">
              From $29, delivered within 24 hours. Hear a preview first and pay only when you love it.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-10 md:pb-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-10 md:space-y-14">
            {groups.map((group) => {
              const pages = landingPages.filter((p) => p.kind === group.kind);
              if (pages.length === 0) return null;
              return (
                <div key={group.kind}>
                  <h2 className="font-display text-foreground mb-4 text-2xl md:text-3xl">
                    {group.heading}
                  </h2>
                  <ul className="space-y-4">
                    {pages.map((p) => (
                      <li key={p.slug}>
                        <Link
                          to={`/custom-song/${p.slug}`}
                          className="text-primary hover:underline font-medium text-body"
                        >
                          {p.h1}
                        </Link>
                        <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <FinalCTA />
    </Layout>
  );
};

export default CustomSongHub;
