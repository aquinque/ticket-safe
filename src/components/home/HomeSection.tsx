import { useRef, type ReactNode } from "react";
import { HomeMedia } from "@/components/home/HomeMedia";
import type { HomeMediaSpec, SectionId } from "@/content/home";
import { cn } from "@/lib/utils";

interface HomeSectionProps {
  id: SectionId;
  media: HomeMediaSpec;
  /** First screen: its image is fetched at once. */
  priority?: boolean;
  shade?: "text" | "even";
  /** Where the content sits: low on the screen like a film caption, or in the middle. */
  place?: "end" | "center";
  /** Extra classes for the content container, for instance more room at the bottom. */
  className?: string;
  children: ReactNode;
}

/**
 * One full-screen section of the home page: the media behind, the content in front. The heading inside must
 * carry the id `${id}-title`, which is what names the section for screen readers.
 */
export function HomeSection({ id, media, priority, shade = "text", place = "end", className, children }: HomeSectionProps) {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      className="home-section home-grain relative isolate overflow-hidden text-white"
    >
      <HomeMedia spec={media} sectionRef={ref} priority={priority} shade={shade} />
      <div
        className={cn(
          "home-section-inner relative z-10 container mx-auto flex flex-col px-4 pb-16 pt-24 md:pb-20",
          place === "end" ? "justify-end" : "justify-center",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}
