import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SongData {
  song_title: string | null;
  cover_image_url: string | null;
  occasion: string;
  recipient_name: string;
  has_lyrics: boolean;
  lyrics_unlocked: boolean;
  lyrics?: string;
}

const formatOccasion = (o: string) =>
  o
    ? o.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

const Keepsake = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SongData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const printedTitle = useRef<string>(document.title);

  useEffect(() => {
    if (!id) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-song-page?orderId=${id}&t=${Date.now()}`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Song not found");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const songUrl = `https://www.personalsonggifts.com/song/${id}`;
    QRCode.toDataURL(songUrl, {
      margin: 1,
      width: 320,
      color: { dark: "#1E3A5F", light: "#00000000" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [id]);

  useEffect(() => {
    if (data?.song_title) {
      document.title = `${data.song_title} — Keepsake`;
    }
    return () => {
      document.title = printedTitle.current;
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FDF8F3" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#1E3A5F" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "#FDF8F3" }}>
        <p className="font-display text-2xl" style={{ color: "#1E3A5F" }}>
          We couldn't find this keepsake.
        </p>
      </div>
    );
  }

  const lyricsAvailable = data.has_lyrics && data.lyrics_unlocked && data.lyrics && data.lyrics.trim().length > 0;

  const renderLyrics = (raw: string) => {
    const lines = raw.split(/\r?\n/);
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (trimmed === "") return <div key={i} className="h-4" aria-hidden />;
      const isTag = /^\[.*\]$/.test(trimmed);
      if (isTag) {
        return (
          <p
            key={i}
            className="italic tracking-wide text-[13px] md:text-sm my-2"
            style={{ color: "#8A8578", fontFamily: "Georgia, serif" }}
          >
            {trimmed}
          </p>
        );
      }
      return (
        <p
          key={i}
          className="text-lg md:text-xl leading-relaxed"
          style={{ color: "#1E3A5F", fontFamily: "Georgia, serif" }}
        >
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="keepsake-page min-h-screen" style={{ background: "#FDF8F3" }}>
      <style>{`
        @media print {
          @page { size: Letter; margin: 0.6in; }
          html, body { background: #FDF8F3 !important; }
          header, nav, footer, .no-print { display: none !important; }
          .keepsake-page { min-height: 0 !important; padding: 0 !important; }
          .keepsake-frame { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="no-print flex justify-end max-w-3xl mx-auto px-6 pt-6">
        <Button
          onClick={() => window.print()}
          className="rounded-full"
          style={{ background: "#1E3A5F", color: "#FDF8F3" }}
        >
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </Button>
      </div>

      <article className="keepsake-frame max-w-3xl mx-auto px-8 md:px-16 py-12 md:py-16 text-center">
        {data.cover_image_url && (
          <img
            src={data.cover_image_url}
            alt=""
            className="mx-auto mb-10 w-64 h-64 md:w-72 md:h-72 object-cover rounded-2xl"
            style={{ boxShadow: "0 20px 40px -20px rgba(30, 58, 95, 0.35)" }}
          />
        )}

        <h1
          className="font-display text-4xl md:text-6xl leading-tight mb-3"
          style={{ color: "#1E3A5F" }}
        >
          {data.song_title || "Untitled"}
        </h1>
        <p
          className="text-sm md:text-base tracking-widest uppercase mb-12"
          style={{ color: "#8A8578", fontFamily: "Georgia, serif" }}
        >
          {formatOccasion(data.occasion)}
          {data.recipient_name ? ` • For ${data.recipient_name}` : ""}
        </p>

        <div
          className="mx-auto mb-12"
          style={{ maxWidth: "36rem", borderTop: "1px solid rgba(30,58,95,0.15)", borderBottom: "1px solid rgba(30,58,95,0.15)", padding: "2.5rem 0" }}
        >
          {lyricsAvailable ? (
            <div className="space-y-1">{renderLyrics(data.lyrics!)}</div>
          ) : (
            <p
              className="italic text-lg"
              style={{ color: "#8A8578", fontFamily: "Georgia, serif" }}
            >
              Lyrics for this song aren't available yet.
            </p>
          )}
        </div>

        {qrDataUrl && (
          <div className="flex flex-col items-center mb-10">
            <img src={qrDataUrl} alt="Scan to listen" className="w-32 h-32" />
            <p
              className="mt-3 text-xs tracking-widest uppercase"
              style={{ color: "#8A8578", fontFamily: "Georgia, serif" }}
            >
              Scan to listen
            </p>
          </div>
        )}

        <p
          className="text-xs tracking-widest uppercase"
          style={{ color: "#8A8578", fontFamily: "Georgia, serif" }}
        >
          Made with ♥ by PersonalSongGifts
        </p>
      </article>
    </div>
  );
};

export default Keepsake;