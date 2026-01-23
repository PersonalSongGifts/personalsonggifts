import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const faqs = [
  {
    question: "How long does it take to receive my song?",
    answer: "Standard orders are typically delivered within 24 hours. Priority orders receive guaranteed priority delivery. We'll send your completed song directly to your email.",
  },
  {
    question: "What kind of songs do you create?",
    answer: "We create custom songs in a variety of styles including Country, Pop, Acoustic, Soft Rock, Gospel, and R&B. Each song is unique and crafted specifically from your story and memories.",
  },
  {
    question: "Can I request changes to my song?",
    answer: "If your song doesn't feel quite right, we'll work with you to make it right. Your satisfaction is our priority, and we want you to love your song as much as your recipient will.",
  },
  {
    question: "Is this really a custom song?",
    answer: "Absolutely. Each song is a unique piece of emotional art created from your specific words, memories, and story. No two songs are ever the same — your song will be one of a kind.",
  },
  {
    question: "What if I don't like the song?",
    answer: "We stand behind every song we create. If it doesn't feel right, we'll work with you to make adjustments or find a solution that makes you happy. Your satisfaction matters to us.",
  },
  {
    question: "How do I share the song with my recipient?",
    answer: "You'll receive a private link to your song that you can share however you'd like — via text, email, or play it in person. Many customers present the song as a surprise at special moments.",
  },
  {
    question: "What information do I need to provide?",
    answer: "We'll ask about your recipient, your relationship, favorite memories, and what makes them special. The more details you share, the more personal your song will be. Don't worry — we guide you through every step.",
  },
];

const FAQSection = () => {
  return (
    <section id="faq" className="py-10 md:py-16 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display text-foreground mb-3 md:mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Have questions? We're here to help.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-card rounded-lg border border-border px-6 data-[state=open]:shadow-soft"
              >
                <AccordionTrigger className="text-left text-lg font-medium hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-body pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Support note */}
        <p className="text-center text-muted-foreground mt-10">
          Still have questions?{" "}
          <a 
            href="mailto:hello@personalsonggifts.com" 
            className="text-primary hover:underline font-medium"
          >
            Email us
          </a>
          {" "}— we respond within 24 hours.
        </p>

        <div className="text-center mt-10">
          <Button asChild size="lg" className="text-lg px-8 py-6">
            <Link to="/create">Create Your Song</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
