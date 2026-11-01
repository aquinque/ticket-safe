import { LayoutDashboard, QrCode, Smartphone, type LucideIcon } from "lucide-react";
import type { PlatformCard } from "@/content/home";
import { revealDelay } from "@/lib/homePage";

const ICONS: Record<PlatformCard["icon"], LucideIcon> = {
  buyer: Smartphone,
  organizer: LayoutDashboard,
  scan: QrCode,
};

/**
 * The three spaces of the platform: side by side from tablet width up, and on a phone one slim row each (icon
 * beside the words) so that all three and the price line fit in a screen or so.
 */
export function PlatformCards({ cards }: { cards: PlatformCard[] }) {
  return (
    <ul className="mt-8 grid gap-3 md:mt-12 md:grid-cols-3 md:gap-4">
      {cards.map((card, i) => {
        const Icon = ICONS[card.icon];
        return (
          <li
            key={card.title}
            data-reveal
            style={revealDelay(i + 1)}
            className="flex items-start gap-4 border border-white/15 bg-black/35 p-5 backdrop-blur-sm md:block md:p-8"
          >
            <Icon className="mt-0.5 h-7 w-7 shrink-0 text-brand-200" aria-hidden="true" />
            <div>
              <h3 className="text-xl font-bold md:mt-5 md:text-2xl">{card.title}</h3>
              <p className="mt-1.5 text-base text-white/80 md:mt-2">{card.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
