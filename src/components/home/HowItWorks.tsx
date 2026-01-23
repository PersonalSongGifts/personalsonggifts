import { FileText, Music, Heart } from "lucide-react";

const steps = [
  {
    icon: FileText,
    title: "Share Your Story",
    description: "Tell us about your loved one, your memories, and what makes them special.",
  },
  {
    icon: Music,
    title: "We Craft Your Song",
    description: "Our team carefully creates a one-of-a-kind song from your words and memories.",
  },
  {
    icon: Heart,
    title: "Delivered With Love",
    description: "Receive your custom song and share a gift they'll treasure forever.",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="font-display text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Creating a meaningful gift has never been simpler
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center group">
              {/* Step number and icon */}
              <div className="relative mb-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-300">
                  <step.icon className="h-8 w-8 text-primary" />
                </div>
                <span className="absolute -top-2 -right-2 md:right-auto md:-left-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </span>
              </div>

              {/* Content */}
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {step.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.description}
              </p>

              {/* Connector line (desktop only) */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[60%] w-[80%] border-t-2 border-dashed border-border" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
