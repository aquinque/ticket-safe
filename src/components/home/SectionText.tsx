import type { ReactNode } from "react";
import type { SectionId } from "@/content/home";
import { revealDelay } from "@/lib/homePage";
import { cn } from "@/lib/utils";

interface SectionTextProps {
  id: SectionId;
  kicker: string;
  title: string;
  body?: string;
  /** A calmer treatment for a section that should not ask for attention (smaller, softer, no call to action). */
  quiet?: boolean;
  children?: ReactNode;
}

/** The kicker, the big heading and the one short paragraph that every full-screen section is built from. */
export function SectionText({ id, kicker, title, body, quiet = false, children }: SectionTextProps) {
  return (
    <div className={quiet ? "max-w-2xl" : "max-w-4xl"}>
      <p data-reveal className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-200 md:text-sm">
        {kicker}
      </p>
      <h2
        id={`${id}-title`}
        data-reveal
        style={revealDelay(1)}
        className={cn(
          "home-text-shadow mt-3 text-balance font-bold leading-[1.05]",
          quiet
            ? "text-3xl font-semibold sm:text-4xl lg:text-5xl"
            : "text-4xl sm:text-5xl lg:text-6xl xl:text-7xl",
        )}
      >
        {title}
      </h2>
      {body && (
        <p
          data-reveal
          style={revealDelay(2)}
          className={cn(
            "home-text-shadow mt-5 max-w-xl text-pretty text-base sm:text-lg lg:text-xl",
            quiet ? "text-white/75" : "text-white/85",
          )}
        >
          {body}
        </p>
      )}
      {children}
    </div>
  );
}
