import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { Cta } from "@/content/home";

interface HomeCtaProps {
  cta: Cta;
  href: string;
}

/** The home page's one kind of button: the site's primary button, large enough for a thumb. */
export function HomeCta({ cta, href }: HomeCtaProps) {
  return (
    <Button asChild size="lg" variant="primary" className="h-12 px-7 text-base md:h-12">
      <Link to={href}>
        {cta.label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
