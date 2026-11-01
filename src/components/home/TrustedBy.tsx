import { partnerLogos, type PartnerLogo } from "@/config/partnerLogos";
import { HOME_COPY } from "@/content/home";

interface TrustedByProps {
  /** Defaults to src/config/partnerLogos.ts; nothing is rendered while the list is empty. */
  partners?: PartnerLogo[];
}

/** A single line of trust: the student associations and schools that already sell through TicketSafe. */
export function TrustedBy({ partners = partnerLogos }: TrustedByProps) {
  if (partners.length === 0) return null;

  return (
    <section aria-label={HOME_COPY.trusted} className="border-t border-border">
      <div className="container mx-auto px-4 py-10 md:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{HOME_COPY.trusted}</p>
        <ul className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4">
          {partners.map((partner) => (
            <li key={partner.name}>
              {partner.src ? (
                <img
                  src={partner.src}
                  alt={partner.name}
                  loading="lazy"
                  decoding="async"
                  className="h-7 w-auto opacity-80 brightness-0 invert md:h-9"
                />
              ) : (
                <span className="font-display text-lg font-bold text-foreground/90 md:text-xl">{partner.name}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
