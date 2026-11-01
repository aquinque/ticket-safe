import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Cta } from "@/content/home";
import { cn } from "@/lib/utils";

interface HomeCtaProps {
  cta: Cta;
  href: string;
  /** "buy": the light-blue purchase button. "brand": brand blue. "ghost": outlined, for a second choice. */
  tone: "buy" | "brand" | "ghost";
}

/** A call to action of the home page, large enough for a thumb. */
export function HomeCta({ cta, href, tone }: HomeCtaProps) {
  return (
    <Button
      asChild
      size="lg"
      variant={tone === "buy" ? "buy" : tone === "brand" ? "primary" : "outline"}
      className={cn(
        "h-12 px-7 text-base md:h-12",
        tone === "ghost" && "border-white/45 bg-black/30 text-white backdrop-blur-sm hover:border-white hover:bg-white/15 hover:text-white",
      )}
    >
      <Link to={href}>
        {cta.label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
