import type { SectionId } from "@/content/home";
import { cn } from "@/lib/utils";

interface SideDotsProps {
  ids: readonly SectionId[];
  labels: Record<SectionId, string>;
  active: string;
  ariaLabel: string;
  onSelect: (id: SectionId) => void;
}

/** A column of dots on the right edge, one per section, on desktop only. The filled one is the section in view. */
export function SideDots({ ids, labels, active, ariaLabel, onSelect }: SideDotsProps) {
  return (
    <nav aria-label={ariaLabel} className="fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 lg:block">
      <ul className="flex flex-col items-end gap-3.5">
        {ids.map((id) => {
          const isActive = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-label={labels[id]}
                aria-current={isActive ? "true" : undefined}
                className="group relative flex h-5 w-5 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="pointer-events-none absolute right-8 whitespace-nowrap bg-black/70 px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {labels[id]}
                </span>
                <span
                  className={cn(
                    "block rounded-full transition-all duration-300",
                    isActive ? "h-3 w-3 bg-white" : "h-2 w-2 bg-white/45 group-hover:bg-white/80",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
