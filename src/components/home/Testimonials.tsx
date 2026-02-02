import { Card } from "@/components/ui/card";
import { Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface TextTestimonial {
  id: string;
  quote: string;
  author: string;
  verified: boolean;
}

const testimonials: TextTestimonial[] = [
  {
    id: "t1",
    quote: '"She has no idea this song is about her... The next part will make her cry."',
    author: "Lilie Beth",
    verified: true,
  },
  {
    id: "t2",
    quote: '"We are still going strong years later... He is my everything."',
    author: "David & Wife",
    verified: true,
  },
  {
    id: "t3",
    quote: '"They always say how much they miss their Dad... Can\'t believe I pulled this off."',
    author: "Kenya & Brandon",
    verified: true,
  },
  {
    id: "t4",
    quote: '"I wrote this for my dad who has always been there for me. He cried the whole time."',
    author: "Sarah M.",
    verified: true,
  },
  {
    id: "t5",
    quote: '"He raised five kids that weren\'t his... and loved them like they were. That\'s the kind of man he is."',
    author: "Stephen",
    verified: true,
  },
  {
    id: "t6",
    quote: '"I gave this to my mom for her 70th birthday and she played it on repeat for a week straight."',
    author: "Rachel M.",
    verified: true,
  },
  {
    id: "t7",
    quote: '"Our wedding guests were in tears. It was the highlight of the entire reception."',
    author: "James & Olivia",
    verified: true,
  },
  {
    id: "t8",
    quote: '"We played it at Dad\'s memorial and there wasn\'t a dry eye in the room. It captured him perfectly."',
    author: "The Rivera Family",
    verified: true,
  },
];

const TextCard = ({ testimonial }: { testimonial: TextTestimonial }) => {
  return (
    <Card className="p-5 md:p-6 bg-card h-full flex flex-col">
      {/* Stars */}
      <div className="flex gap-0.5 mb-3">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      
      {/* Quote */}
      <p className="text-foreground text-base leading-relaxed mb-4 flex-grow">
        {testimonial.quote}
      </p>
      
      {/* Author with verified badge */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground text-sm">
          {testimonial.author}
        </span>
        {testimonial.verified && (
          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            Verified
          </span>
        )}
      </div>
    </Card>
  );
};

const Testimonials = () => {
  return (
    <section id="reviews" className="pt-4 pb-10 md:pt-6 md:pb-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-6 md:mb-10">
          <h2 className="font-display text-foreground mb-4 italic">
            Real stories from real customers
          </h2>
        </div>

        {/* 4-column responsive grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {testimonials.map((testimonial) => (
              <TextCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </div>
        </div>

        <div className="text-center mt-10">
          <Button asChild size="lg" className="text-lg px-8 py-6">
            <Link to="/create">Create Your Song</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
