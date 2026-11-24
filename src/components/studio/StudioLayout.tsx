import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  LineChart,
  Repeat2,
  Users,
  QrCode,
  Banknote,
  CreditCard,
  Settings,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Plus,
} from "lucide-react";
import Logo from "@/components/Logo";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrganizerLite {
  name: string;
  logo_url: string | null;
}

type NavItem = { key: string; label: string; to: string; icon: typeof LayoutDashboard };

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", to: "/studio", icon: LayoutDashboard },
  { key: "events", label: "Events", to: "/studio/events", icon: CalendarDays },
  { key: "sales", label: "Sales", to: "/studio/sales", icon: LineChart },
  { key: "resale", label: "Resale", to: "/resale", icon: Repeat2 },
  { key: "checkin", label: "Check-in", to: "/organizer/scan", icon: QrCode },
  { key: "team", label: "Team / Staff", to: "/studio/team", icon: Users },
  { key: "payouts", label: "Payouts", to: "/studio/payouts", icon: Banknote },
  { key: "payments", label: "Payments (Stripe)", to: "/studio/payments", icon: CreditCard },
  { key: "settings", label: "Settings", to: "/studio/profile", icon: Settings },
];

/** The sidebar reads in the order of an event's life: sell it, run the door, get paid. */
const NAV_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Sell", keys: ["dashboard", "events", "sales", "resale"] },
  { title: "At the door", keys: ["checkin", "team"] },
  { title: "Money", keys: ["payouts", "payments"] },
  { title: "Account", keys: ["settings"] },
];

/**
 * App-shell layout for TicketSafe Studio: left sidebar (collapsible on
 * desktop, drawer on mobile) + topbar with org identity and account menu.
 * Renders in `.theme-studio`: the site's deep navy, brand blue as the only accent.
 */
export const StudioLayout = ({
  children,
  active,
  organizer,
}: {
  children: ReactNode;
  active: string;
  organizer?: OrganizerLite | null;
}) => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  // The logo goes back to the site's home page. The mobile drawer draws its own, beside the close button.
  const OrgMark = ({ size = "w-8 h-8" }: { size?: string }) =>
    organizer?.logo_url ? (
      <img src={organizer.logo_url} alt="" className={`${size} rounded-lg object-cover shrink-0 ring-1 ring-border`} />
    ) : (
      <div className={`${size} rounded-lg bg-primary/20 text-[hsl(222_100%_84%)] flex items-center justify-center text-xs font-black shrink-0`}>
        {organizer?.name?.[0]?.toUpperCase() ?? "S"}
      </div>
    );

  // The logo goes back to the site's home page. The mobile drawer draws its own, beside the close button.
  const SidebarContent = ({ onNavigate, showLogo = true, compact = false }: { onNavigate?: () => void; showLogo?: boolean; compact?: boolean }) => (
    <>
      {showLogo && (
        <div className="flex items-center gap-2 px-4 h-16 shrink-0">
          <Link to="/" className="flex items-center gap-2 min-w-0" onClick={onNavigate} aria-label="TicketSafe home">
            <Logo height={26} iconOnly={compact} />
          </Link>
          {!compact && <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Studio</span>}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto pb-3 px-2" aria-label="Studio">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title} className={gi === 0 ? "" : "mt-4"}>
            {compact ? (
              gi > 0 && <div className="mx-3 mb-3 border-t border-border" />
            ) : (
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">{group.title}</p>
            )}
            <div className="space-y-0.5">
              {group.keys.map((key) => {
                const item = NAV_ITEMS.find((n) => n.key === key)!;
                const Icon = item.icon;
                const isActive = active === item.key;
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={onNavigate}
                    title={compact ? item.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? "studio-nav-on" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[hsl(222_100%_80%)]" : ""}`} />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-2 border-t border-border shrink-0 space-y-1">
        {organizer && !compact && (
          <Link
            to="/studio/profile"
            onClick={onNavigate}
            className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent/70 transition-colors min-w-0"
          >
            <OrgMark />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground truncate">{organizer.name}</span>
              <span className="block text-[11px] text-muted-foreground">Organizer account</span>
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex items-center gap-3 px-3 h-9 rounded-lg text-xs font-medium text-muted-foreground hover:bg-accent/70 hover:text-foreground transition-colors w-full"
          aria-label={collapsed ? "Expand the menu" : "Collapse the menu"}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="theme-studio min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen border-r border-border bg-[hsl(var(--studio-rail))] transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <SidebarContent compact={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[hsl(var(--studio-rail))] border-r border-border flex flex-col menu-rise">
            <div className="flex items-center justify-between px-4 h-16">
              <Link to="/" className="flex items-center min-w-0" onClick={() => setMobileOpen(false)} aria-label="TicketSafe home">
                <Logo height={26} />
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-secondary"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} showLogo={false} />
          </aside>
        </div>
      )}

      <div className="studio-main flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/75 backdrop-blur-md flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-9 h-9 rounded-md flex items-center justify-center hover:bg-secondary"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <BackButton />
            {organizer && (
              <div className="flex items-center gap-2 min-w-0 md:hidden">
                <OrgMark />
                <span className="font-semibold text-sm text-foreground truncate">{organizer.name}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
          {/* Dashboard and Events have their own "New event" button in the page. */}
          {!["dashboard", "events"].includes(active) && <Link
            to="/studio/events/new"
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" /> New event
          </Link>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Account menu" className="w-9 h-9 rounded-full bg-primary/20 text-[hsl(222_100%_84%)] ring-1 ring-border flex items-center justify-center font-bold text-sm hover:bg-primary/30 transition-colors shrink-0">
                {organizer?.name?.[0]?.toUpperCase() ?? "S"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/studio/profile")}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/")}>Back to site</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        {/* Room for the phone tab bar, so nothing ends up hidden behind it */}
        <main className="flex-1 min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"><div className="studio-enter">{children}</div></main>

        {/* Phone: the four places organisers go most, one thumb away. Everything else is in the menu. */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-[hsl(var(--studio-rail))]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]" aria-label="Studio">
          <ul className="grid grid-cols-5">
            {NAV_ITEMS.filter((n) => ["dashboard", "events", "sales", "checkin"].includes(n.key)).map((item) => {
              const Icon = item.icon;
              const on = active === item.key;
              return (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    aria-current={on ? "page" : undefined}
                    className={`flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-bold uppercase tracking-wide transition-colors ${on ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className={`w-9 h-7 rounded-full flex items-center justify-center transition-colors ${on ? "bg-primary/30 text-[hsl(222_100%_84%)]" : ""}`}><Icon className="w-5 h-5" /></span>
                    {item.key === "dashboard" ? "Home" : item.key === "checkin" ? "Scan" : item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={`w-full flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-bold uppercase tracking-wide transition-colors ${["team", "payouts", "payments", "settings", "resale"].includes(active) ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="More"
              >
                <span className={`w-9 h-7 rounded-full flex items-center justify-center ${["team", "payouts", "payments", "settings", "resale"].includes(active) ? "bg-primary/30 text-[hsl(222_100%_84%)]" : ""}`}><Menu className="w-5 h-5" /></span>
                More
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
};
