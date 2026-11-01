import { partnerLogos, type PartnerLogo } from "@/config/partnerLogos";
import { revealDelay } from "@/lib/homePage";

interface TrustedByProps {
  title: string;
  /** Defaults to src/config/partnerLogos.ts; the row is not rendered at all while the list is empty. */
  partners?: PartnerLogo[];
}

/** "Ils nous font confiance": the schools and associations that already sell through TicketSafe. */
export function TrustedBy({ title, partners = partnerLogos }: TrustedByProps) {
  if (partners.length === 0) return null;

  return (
    <div data-reveal style={revealDelay(3)} className="mt-10 md:mt-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">{title}</p>
      <ul className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        {partners.map((partner) => (
          <li key={partner.name}>
            {partner.src ? (
              <img
                src={partner.src}
                alt={partner.name}
                loading="lazy"
                decoding="async"
                className="h-7 w-auto opacity-85 brightness-0 invert md:h-9"
              />
            ) : (
              <span className="font-display text-lg font-bold text-white/90 md:text-xl">{partner.name}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
