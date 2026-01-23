import { Card } from "@/components/ui/card";
import { Quote, Play } from "lucide-react";

const testimonials = [
  {
    id: 1,
    quote: "She cried happy tears. This was the most meaningful gift I've ever given in 30 years of marriage.",
    author: "Robert M.",
    occasion: "50th Anniversary",
    hasVideo: false,
  },
  {
    id: 2,
    quote: "My mother couldn't believe it was made just for her. She plays it every single day.",
    author: "Jennifer S.",
    occasion: "80th Birthday",
    hasVideo: true,
  },
  {
    id: 3,
    quote: "We'll treasure this forever. It captured our love story perfectly.",
    author: "Michael & Sarah",
    occasion: "Wedding",
    hasVideo: false,
  },
  {
    id: 4,
    quote: "The song brought back so many beautiful memories of my father. Thank you for this gift.",
    author: "Lisa T.",
    occasion: "Memorial",
    hasVideo: true,
  },
  {
    id: 5,
    quote: "I've never seen my husband so emotional. Worth every penny and more.",
    author: "Patricia K.",
    occasion: "Anniversary",
    hasVideo: false,
  },
  {
    id: 6,
    quote: "Our daughter's lullaby is now part of our nightly routine. Pure magic.",
    author: "Amanda & David",
    occasion: "Baby",
    hasVideo: false,
  },
];

const Testimonials = () => {
  return (
    <section id="reviews" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-foreground mb-4">
            Stories From Our Customers
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Real reactions from real people who gave the gift of a custom song
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial) => (
            <Card 
              key={testimonial.id}
              className="p-6 bg-card hover:shadow-card transition-all duration-300 relative"
            >
              {/* Quote icon */}
              <Quote className="h-8 w-8 text-primary/20 absolute top-4 right-4" />
              
              {/* Video indicator */}
              {testimonial.hasVideo && (
                <div className="mb-4 bg-secondary rounded-lg aspect-video flex items-center justify-center cursor-pointer hover:bg-secondary/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                    <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                  </div>
                </div>
              )}

              {/* Quote */}
              <blockquote className="text-foreground text-lg leading-relaxed mb-4">
                "{testimonial.quote}"
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-semibold text-sm">
                    {testimonial.author.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {testimonial.author}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {testimonial.occasion}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
