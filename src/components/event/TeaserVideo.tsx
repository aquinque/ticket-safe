import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export type VideoShape = "unknown" | "portrait" | "landscape";

/**
 * Whether a video is taller than wide, read from its metadata only (no download of the
 * whole file). A vertical promo video belongs under the tickets, not cropped into the
 * 16:9 poster frame. Stays "unknown" while loading and when the file can't be read.
 */
export function useVideoShape(src: string | null | undefined): VideoShape {
  const [shape, setShape] = useState<VideoShape>("unknown");
  useEffect(() => {
    setShape("unknown");
    if (!src) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => setShape(v.videoHeight > v.videoWidth ? "portrait" : "landscape");
    v.src = src;
    return () => {
      v.onloadedmetadata = null;
      v.removeAttribute("src");
      v.load();
    };
  }, [src]);
  return shape;
}

/**
 * The organizer's vertical promo video, under the tickets: plays muted on a loop like a
 * story, with a button to turn the sound on. Hidden if the file can't play.
 */
export function TeaserVideo({ src, poster, title }: { src: string; poster?: string | null; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.play().catch(() => { /* autoplay blocked: the first frame stays */ });
  }, [src]);

  if (failed) return null;

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) v.play().catch(() => {});
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-black" aria-label={`${title}: teaser video`}>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        className="block w-full aspect-[9/16] max-h-[640px] object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        onClick={toggleSound}
        aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
        aria-pressed={!muted}
        className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/55 text-white backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {muted ? <VolumeX className="w-5 h-5" strokeWidth={1.75} /> : <Volume2 className="w-5 h-5" strokeWidth={1.75} />}
      </button>
    </section>
  );
}
