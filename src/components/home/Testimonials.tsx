import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Play, Pause, Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface VideoTestimonial {
  id: string;
  type: "video";
  videoSrc: string;
  overlayQuote: string;
  overlayCaption: string;
  title: string;
}

interface TextTestimonial {
  id: string;
  type: "text";
  quote: string;
  author: string;
  verified: boolean;
}

type Testimonial = VideoTestimonial | TextTestimonial;

const testimonials: Testimonial[] = [
  // Row 1
  {
    id: "v1",
    type: "video",
    videoSrc: "/videos/reaction-1.mp4",
    overlayQuote: '"you taught me to love self and to be kind" ❤️',
    overlayCaption: "Mom thought I forgot her birthday, but secretly I had THIS planned...",
    title: "Birthday Tribute for Mom",
  },
  {
    id: "t1",
    type: "text",
    quote: '"She has no idea this song is about her... The next part will make her cry."',
    author: "Lilie Beth",
    verified: true,
  },
  {
    id: "v2",
    type: "video",
    videoSrc: "/videos/reaction-2.mp4",
    overlayQuote: '"He is my everything, and loving him will always be the best part of me" 👫🥰',
    overlayCaption: "Husband thought I forgot our anniversary, but secretly I had THIS planned...",
    title: "Golden Anniversary Surprise",
  },
  {
    id: "t2",
    type: "text",
    quote: '"We are still going strong years later... He is my everything."',
    author: "David & Wife",
    verified: true,
  },
  // Row 2
  {
    id: "v3",
    type: "video",
    videoSrc: "/videos/reaction-3.mp4",
    overlayQuote: '"time" 💕',
    overlayCaption: "After losing their dad, mom gets them a birthday surprise of a lifetime...",
    title: "Memorial Birthday Surprise",
  },
  {
    id: "t3",
    type: "text",
    quote: '"They always say how much they miss their Dad... Can\'t believe I pulled this off."',
    author: "Kenya & Brandon",
    verified: true,
  },
  {
    id: "v4",
    type: "video",
    videoSrc: "/videos/reaction-4.mp4",
    overlayQuote: '"You\'ve always been my rock, Dad" 💪',
    overlayCaption: "Dad had no idea his daughter wrote him a song... watch his reaction...",
    title: "Father's Day Surprise",
  },
  {
    id: "t4",
    type: "text",
    quote: '"I wrote this for my dad who has always been there for me. He cried the whole time."',
    author: "Sarah M.",
    verified: true,
  },
];

const VideoCard = ({ testimonial }: { testimonial: VideoTestimonial }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  return (
    <div className="flex flex-col">
      <div 
        className="relative rounded-xl overflow-hidden cursor-pointer group aspect-[3/4]"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={testimonial.videoSrc}
          className="w-full h-full object-cover"
          onEnded={handleVideoEnd}
          playsInline
        />
        
        {/* Dark gradient overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`} />
        
        {/* Play button */}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}>
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            {isPlaying ? (
              <Pause className="h-6 w-6 text-foreground" />
            ) : (
              <Play className="h-6 w-6 text-foreground ml-1" />
            )}
          </div>
        </div>
        
        {/* Quote overlay at top */}
        <div className={`absolute top-4 left-4 right-4 transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}>
          <p className="text-white text-sm md:text-base font-medium leading-snug drop-shadow-lg">
            {testimonial.overlayQuote}
          </p>
        </div>
        
        {/* Caption overlay at bottom */}
        <div className={`absolute bottom-4 left-4 right-4 transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}>
          <p className="text-white/90 text-xs md:text-sm leading-snug drop-shadow-lg">
            {testimonial.overlayCaption}
          </p>
        </div>
      </div>
      
      {/* Title below video */}
      <p className="text-sm text-muted-foreground mt-3 font-medium">
        {testimonial.title}
      </p>
    </div>
  );
};

const TextCard = ({ testimonial }: { testimonial: TextTestimonial }) => {
  return (
    <Card className="p-6 bg-card h-fit">
      {/* Stars */}
      <div className="flex gap-0.5 mb-3">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      
      {/* Quote */}
      <p className="text-foreground text-base leading-relaxed mb-4">
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
    <section id="reviews" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-foreground mb-4 italic">
            Real stories from real customers
          </h2>
        </div>

        {/* Masonry-style grid layout */}
        <div className="max-w-6xl mx-auto">
          {/* Row 1: Video - Text - Video - Text */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <VideoCard testimonial={testimonials[0] as VideoTestimonial} />
            <div className="flex items-center">
              <TextCard testimonial={testimonials[1] as TextTestimonial} />
            </div>
            <VideoCard testimonial={testimonials[2] as VideoTestimonial} />
            <div className="flex items-center">
              <TextCard testimonial={testimonials[3] as TextTestimonial} />
            </div>
          </div>

          {/* Row 2: Video - Text - Video (centered) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-start-1">
              <VideoCard testimonial={testimonials[4] as VideoTestimonial} />
            </div>
            <div className="flex items-center">
              <TextCard testimonial={testimonials[5] as TextTestimonial} />
            </div>
            <div className="lg:col-start-3">
              <VideoCard testimonial={testimonials[6] as VideoTestimonial} />
            </div>
            <div className="flex items-center">
              <TextCard testimonial={testimonials[7] as TextTestimonial} />
            </div>
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
