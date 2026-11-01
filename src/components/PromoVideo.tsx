import { useEffect, useRef, useState } from "react";

interface PromoVideoProps {
  src: string;
  /** Banner image, shown while the video loads and if it can't play. */
  poster?: string | null;
  className?: string;
}

/**
 * Muted looping promo video. React doesn't reliably set the `muted` attribute,
 * which makes browsers (iOS Safari especially) refuse to autoplay, so we set
 * it on the element and call play() ourselves. Falls back to the poster image
 * when the file can't be decoded or played.
 */
export function PromoVideo({ src, poster, className = "" }: PromoVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.play().catch(() => {
      /* autoplay blocked: the poster stays visible */
    });
  }, [src]);

  if (failed) {
    return poster ? <img src={poster} alt="" className={className} /> : null;
  }

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      onError={() => setFailed(true)}
    />
  );
}
