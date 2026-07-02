import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { Loader2, Printer } from "lucide-react";

interface SongData {
  song_title: string | null;
  cover_image_url: string | null;
  occasion: string;
  recipient_name: string;
  has_lyrics: boolean;
  lyrics_unlocked: boolean;
  lyrics?: string;
}

const PAPER = "#FAF6EC";
const INK = "#211E1A";
const GOLD = "#B0894F";
const MUTED = "#8A7F6C";

const formatOccasion = (o: string) =>
  o ? o.replace(/[-_]/g, " ").toUpperCase() : "";

const Keepsake = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SongData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const originalTitle = useRef<string>(document.title);

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
      width: 480,
      color: { dark: INK, light: "#00000000" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [id]);

  useEffect(() => {
    if (data?.song_title) document.title = `${data.song_title} — Keepsake`;
    const prev = originalTitle.current;
    return () => {
      document.title = prev;
    };
  }, [data]);

  const lyricsAvailable = !!(
    data?.has_lyrics && data.lyrics_unlocked && data.lyrics && data.lyrics.trim().length > 0
  );

  const lyricsNodes = useMemo(() => {
    if (!data?.lyrics) return null;
    // 1) strip bracketed stage-direction lines entirely
    // 2) collapse runs of blank lines into a single stanza gap
    const rawLines = data.lyrics.split(/\r?\n/).map((l) => l.trim());
    const kept: string[] = [];
    for (const line of rawLines) {
      if (/^\[.*\]$/.test(line)) continue;
      if (line === "" && (kept.length === 0 || kept[kept.length - 1] === "")) continue;
      kept.push(line);
    }
    while (kept.length && kept[kept.length - 1] === "") kept.pop();

    return kept.map((line, i) => {
      if (line === "") return <div key={i} style={{ height: "0.75em" }} aria-hidden />;
      return (
        <p key={i} style={{ margin: 0 }}>
          {line}
        </p>
      );
    });
  }, [data]);

  // Auto-fit ladder — prioritize readability:
  //   1) 1 column @ 16px  → 2) 2 columns @ 16px  → 3) 2 columns, shrink to 12px floor
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState<1 | 2>(1);
  const [fontScale, setFontScale] = useState<number>(16);

  const lhFor = (size: number) => Math.max(1.35, 1.6 - (16 - size) * 0.02);

  useLayoutEffect(() => {
    if (!lyricsAvailable) return;

    const applyAndMeasure = (cols: 1 | 2, size: number) => {
      const node = lyricsRef.current;
      if (!node) return true;
      node.style.columnCount = String(cols);
      node.style.fontSize = `${size}px`;
      node.style.lineHeight = `${lhFor(size)}`;
      // force reflow
      void node.offsetHeight;
      return node.scrollHeight <= node.clientHeight + 1;
    };

    const fit = () => {
      const node = lyricsRef.current;
      if (!node) return;

      // Step 1: single column @ 16px
      if (applyAndMeasure(1, 16)) {
        setColumns(1);
        setFontScale(16);
        return;
      }
      // Step 2: two columns @ 16px
      if (applyAndMeasure(2, 16)) {
        setColumns(2);
        setFontScale(16);
        return;
      }
      // Step 3: two columns, shrink from 16 → 12
      let size = 16;
      let guard = 0;
      while (size > 12 && guard < 40) {
        size = Math.max(12, size - 0.5);
        if (applyAndMeasure(2, size)) break;
        guard++;
      }
      setColumns(2);
      setFontScale(size);
    };

    requestAnimationFrame(() => {
      fit();
      setTimeout(fit, 200);
    });
  }, [lyricsNodes, lyricsAvailable, qrDataUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: PAPER }}>
        <p style={{ color: INK, fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 28 }}>
          We couldn't find this keepsake.
        </p>
      </div>
    );
  }

  const eyebrow = [
    formatOccasion(data.occasion),
    data.recipient_name ? `FOR ${data.recipient_name.toUpperCase()}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="keepsake-root">
      <style>{`
        .keepsake-root {
          min-height: 100vh;
          background: #E8E2D4;
          padding: 32px 16px 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family: "EB Garamond", Georgia, serif;
          color: ${INK};
        }
        .ks-toolbar {
          width: 100%;
          max-width: 8.5in;
          display: flex;
          justify-content: flex-end;
          margin-bottom: 20px;
        }
        .ks-print-btn {
          font-family: "EB Garamond", Georgia, serif;
          background: transparent;
          color: ${INK};
          border: 1px solid ${GOLD};
          padding: 10px 20px;
          letter-spacing: 0.22em;
          font-size: 11px;
          text-transform: uppercase;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 2px;
          transition: background 0.2s, color 0.2s;
        }
        .ks-print-btn:hover { background: ${GOLD}; color: ${PAPER}; }

        .ks-sheet {
          position: relative;
          width: 8.5in;
          height: 11in;
          overflow: hidden;
          background: ${PAPER};
          padding: 0.4in;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color-adjust: exact;
          box-shadow: 0 30px 60px -30px rgba(0,0,0,0.25);
        }
        .ks-frame {
          border: 1px solid ${GOLD};
          padding: 6px;
          height: calc(11in - 0.8in);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .ks-frame-inner {
          border: 1px solid ${GOLD};
          padding: 0.55in 0.65in 0.5in;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .ks-cover {
          width: 1.85in;
          height: 1.85in;
          object-fit: cover;
          border: 1px solid ${GOLD};
          border-radius: 3px;
          display: block;
          background: transparent;
        }

        .ks-title {
          font-family: "Cormorant Garamond", Georgia, serif;
          font-weight: 600;
          color: ${INK};
          font-size: clamp(30px, 4.6vw, 44px);
          line-height: 1.05;
          letter-spacing: -0.01em;
          margin: 18px 0 8px;
          text-wrap: balance;
        }

        .ks-eyebrow {
          font-family: "EB Garamond", Georgia, serif;
          color: #6E6555;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 12.5px;
        }

        .ks-ornament {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin: 14px 0 14px;
          color: ${GOLD};
        }
        .ks-ornament .rule {
          width: 56px;
          height: 1px;
          background: ${GOLD};
        }
        .ks-ornament .diamond {
          font-size: 10px;
          transform: translateY(-1px);
        }

        .ks-lyrics {
          width: 100%;
          max-width: 6.6in;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          columns: 1;
          column-gap: 2.5rem;
          column-fill: balance;
          column-rule: 1px solid rgba(176, 137, 79, 0.25);
          text-align: left;
          margin: 0 auto 28px;
          font-size: 16px;
          line-height: 1.6;
          color: ${INK};
        }
        .ks-lyrics p { orphans: 2; widows: 2; }

        .ks-lyrics-missing {
          font-style: italic;
          color: ${MUTED};
          font-size: 16px;
          margin: 60px 0;
        }

        .ks-signature {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 14px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .ks-vinyl {
          position: relative;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background:
            repeating-radial-gradient(
              circle at 50% 50%,
              ${GOLD} 0px,
              ${GOLD} 1px,
              transparent 1px,
              transparent 4px
            );
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid ${GOLD};
        }
        .ks-vinyl::before {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          border: 1px solid rgba(33, 30, 26, 0.25);
          pointer-events: none;
        }
        .ks-vinyl-label {
          position: relative;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: ${PAPER};
          border: 1px solid ${GOLD};
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .ks-vinyl-label img {
          width: 78px;
          height: 78px;
          display: block;
        }
        .ks-vinyl-label::after {
          content: "";
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${GOLD};
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 0 2px ${PAPER};
        }

        .ks-scan-caption {
          margin-top: 14px;
          color: #6E6555;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 12.5px;
        }

        .ks-footer {
          margin-top: 22px;
          color: ${MUTED};
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 10px;
        }

        @media (max-width: 900px) {
          .ks-sheet { width: 100%; height: auto; overflow: visible; padding: 20px; }
          .ks-frame { height: auto; overflow: visible; }
          .ks-frame-inner { overflow: visible; }
          .ks-lyrics { overflow: visible; }
          .ks-frame-inner { padding: 28px 22px; }
          .ks-lyrics { columns: 1; max-width: 100%; }
        }

        @media print {
          @page { size: Letter; margin: 0; }
          html, body { background: ${PAPER} !important; margin: 0 !important; padding: 0 !important; }
          header, nav, footer, .no-print { display: none !important; }
          .keepsake-root { background: ${PAPER} !important; padding: 0 !important; min-height: 0 !important; }
          .ks-toolbar { display: none !important; }
          .ks-sheet {
            width: 8.5in !important;
            height: 11in !important;
            overflow: hidden !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0.4in !important;
          }
          .ks-frame { height: calc(11in - 0.8in) !important; overflow: hidden !important; }
          .ks-frame-inner { overflow: hidden !important; }
          .ks-lyrics { overflow: hidden !important; }
          .ks-signature { break-inside: avoid !important; page-break-inside: avoid !important; }
          .ks-vinyl, .ks-vinyl-label, .ks-cover, .ks-frame, .ks-frame-inner,
          .ks-ornament .rule, .ks-vinyl-label::after {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div className="ks-toolbar no-print">
        <button className="ks-print-btn" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" />
          Print / Save as PDF
        </button>
      </div>

      <article className="ks-sheet">
        <div className="ks-frame">
          <div className="ks-frame-inner">
            {data.cover_image_url && (
              <img className="ks-cover" src={data.cover_image_url} alt="" />
            )}

            <h1 className="ks-title">{data.song_title || "Untitled"}</h1>

            {eyebrow && <div className="ks-eyebrow">{eyebrow}</div>}

            <div className="ks-ornament" aria-hidden>
              <span className="rule" />
              <span className="diamond">◆</span>
              <span className="rule" />
            </div>

            {lyricsAvailable ? (
              <div
                className="ks-lyrics"
                ref={lyricsRef}
                style={{
                  columnCount: columns,
                  fontSize: `${fontScale}px`,
                  lineHeight: Math.max(1.35, 1.6 - (16 - fontScale) * 0.02),
                }}
              >
                {lyricsNodes}
              </div>
            ) : (
              <p className="ks-lyrics-missing">Lyrics for this song aren't available yet.</p>
            )}

            <div className="ks-signature">
              <div className="ks-vinyl" aria-hidden>
                <div className="ks-vinyl-label">
                  {qrDataUrl && <img src={qrDataUrl} alt="Scan to play" />}
                </div>
              </div>
              <div className="ks-scan-caption">Scan to play</div>
              <div className="ks-footer">
                Personal Song Gifts · {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
};

export default Keepsake;