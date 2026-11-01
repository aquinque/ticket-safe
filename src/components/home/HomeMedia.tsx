import { useEffect, useRef, useState, type RefObject } from "react";
import type { HomeMediaSpec } from "@/content/home";
import { useAfterFirstPaint, useNearViewport, useOnScreen, useParallax } from "@/hooks/useHomeScroll";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useVideoAllowed } from "@/hooks/useVideoAllowed";
import { FIRST_SCREEN_MEDIA_DELAY_MS, pictureSources, videoSources } from "@/lib/homePage";

interface HomeMediaProps {
  spec: HomeMediaSpec;
  /** The section the media sits behind: it decides when the media loads, plays and drifts. */
  sectionRef: RefObject<HTMLElement>;
  /** First screen: its media starts shortly after the first paint (FIRST_SCREEN_MEDIA_DELAY_MS), not when it nears the screen. */
  priority?: boolean;
  /** "text": darkest low and on the left, where the words are. "even": the same shade everywhere. */
  shade?: "text" | "even";
}

// React 18 warns about the camel-case spelling of this attribute; the lowercase one is plain HTML.
const highPriority = { fetchpriority: "high" } as Record<string, string>;

/**
 * The picture or video behind a section, with its black shade. It always sits on a colour fallback, so a file
 * that is missing or still loading never shows as a broken image. The image is the poster of the video; the
 * video itself only loads when the screen, the connection and the visitor's motion setting allow it, and only
 * once the section is within a screen of being seen. It pauses when the section is off screen.
 */
export function HomeMedia({ spec, sectionRef, priority = false, shade = "text" }: HomeMediaProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useReducedMotion();
  const videoAllowed = useVideoAllowed();
  const near = useNearViewport(sectionRef);
  const painted = useAfterFirstPaint(FIRST_SCREEN_MEDIA_DELAY_MS);
  const mayLoad = !priority || painted;
  const onScreen = useOnScreen(sectionRef);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useParallax(sectionRef, layerRef, !reducedMotion && !!(spec.image || spec.video));

  const showVideo = !!spec.video && videoAllowed && near && mayLoad && !videoFailed;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (onScreen) {
      // React sets `muted` as a property only; autoplay needs it in place before play().
      video.muted = true;
      video.play().catch(() => {
        /* autoplay refused: the poster stays */
      });
    } else {
      video.pause();
    }
  }, [onScreen, showVideo]);

  return (
    <>
      <div ref={layerRef} className={`home-layer${spec.blur ? " home-layer-blur" : ""}`} aria-hidden="true">
        <div className={`home-fallback home-fallback-${spec.tone}`} />
        {spec.image && !imageFailed && mayLoad && (
          <picture>
            {pictureSources(spec.image).map((source) => (
              <source key={source.type} srcSet={source.srcSet} type={source.type} />
            ))}
            <img
              className={`home-media-fill home-photo${imageLoaded ? " is-loaded" : ""}`}
              src={spec.image.src}
              width={spec.image.width}
              height={spec.image.height}
              alt=""
              decoding="async"
              loading={priority ? "eager" : "lazy"}
              {...(priority ? highPriority : {})}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          </picture>
        )}
        {showVideo && spec.video && (
          <video
            ref={videoRef}
            className={`home-media-fill home-video${videoReady ? " is-ready" : ""}`}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={spec.image?.src}
            onCanPlay={() => setVideoReady(true)}
            onError={() => setVideoFailed(true)}
          >
            {/* A source that cannot load fires its own error and the browser moves on to the next one, so only the
                last one failing means there is nothing left to play. */}
            {videoSources(spec.video).map((source, i, all) => (
              <source
                key={source.type}
                src={source.src}
                type={source.type}
                onError={i === all.length - 1 ? () => setVideoFailed(true) : undefined}
              />
            ))}
          </video>
        )}
      </div>
      <div
        className={`home-shade home-shade-${shade}`}
        data-media={imageLoaded || videoReady ? "on" : "off"}
        aria-hidden="true"
      />
    </>
  );
}
