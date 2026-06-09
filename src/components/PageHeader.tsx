import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface PageHeaderProps {
  /** Lucide icon shown in the rounded tile. */
  icon: LucideIcon;
  /** Page title — bold, 2xl on mobile / 3xl on desktop. */
  title: string;
  /** Optional one-line description below the title. */
  description?: string;
  /** Optional right-aligned slot for CTAs, refresh buttons, etc. */
  action?: ReactNode;
  /** Optional Tailwind override for the icon tile background (defaults to primary tint). */
  iconClass?: string;
}

/**
 * Shared page header used across Settings, MyTicketsHub, Admin pages and
 * the Studio surface. Keeps the icon + title + subtitle pattern visually
 * identical no matter which area of the site the user is in, so a
 * first-time visitor can re-orient instantly when they navigate around.
 */
export const PageHeader = ({
  icon: Icon,
  title,
  description,
  action,
  iconClass = "bg-primary/10 text-primary",
}: PageHeaderProps) => (
  <div className="flex items-start justify-between gap-3 mb-6">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-black leading-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
