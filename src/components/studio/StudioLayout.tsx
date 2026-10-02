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
  Settings,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
} from "lucide-react";
import Logo from "@/components/Logo";
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

const NAV_ITEMS: { key: string; label: string; to: string; icon: typeof LayoutDashboard; soon?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", to: "/studio", icon: LayoutDashboard },
  { key: "events", label: "Events", to: "/studio", icon: CalendarDays },
  { key: "sales", label: "Sales", to: "/studio/sales", icon: LineChart },
  { key: "resale", label: "Resale", to: "/resale", icon: Repeat2 },
  { key: "team", label: "Team / Staff", to: "/studio/team", icon: Users },
  { key: "checkin", label: "Check-in", to: "/organizer/scan", icon: QrCode },
  { key: "payouts", label: "Payouts", to: "/studio/payouts", icon: Banknote },
  { key: "settings", label: "Settings", to: "/studio/profile", icon: Settings },
];

/**
 * App-shell layout for TicketSafe Studio: left sidebar (collapsible on
 * desktop, drawer on mobile) + topbar with org identity and account menu.
 * Renders in `.theme-studio` — light, sober, brand-500 primary, no lime.
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

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="flex items-center gap-2 px-4 h-16 border-b border-border shrink-0">
        <Link to="/studio" className="flex items-center gap-2 min-w-0" onClick={onNavigate}>
          <Logo height={26} iconOnly={collapsed} />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          if (item.soon) {
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
                title="Coming soon"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 truncate flex items-center justify-between gap-2">
                    {item.label}
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
                      Soon
                    </span>
                  </span>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.key}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/75 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="p-2 border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
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
        className={`hidden md:flex flex-col shrink-0 border-r border-border bg-card transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col">
            <div className="flex items-center justify-between px-4 h-16 border-b border-border">
              <Logo height={26} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-secondary"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-9 h-9 rounded-md flex items-center justify-center hover:bg-secondary"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {organizer && (
              <div className="flex items-center gap-2 min-w-0">
                {organizer.logo_url ? (
                  <img src={organizer.logo_url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                    {organizer.name[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <span className="font-semibold text-sm text-foreground truncate">{organizer.name}</span>
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm hover:bg-primary/20 transition-colors shrink-0">
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
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
};
