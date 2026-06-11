import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  className?: string;
  /** Where to go when there's no in-app history to pop (direct landing). */
  fallbackPath?: string;
}

/**
 * Sensible parent for a given path when we can't go "back" (the user landed
 * here directly via a link / new tab, so there's nothing to pop). Keeps the
 * arrow meaningful — it goes one level up, to a real route, never to a 404.
 */
function smartParent(pathname: string): string {
  if (pathname.startsWith("/settings/")) return "/settings";
  if (pathname.startsWith("/studio/")) return "/studio";
  if (pathname.startsWith("/admin/")) return "/admin/organizers";
  if (pathname.startsWith("/my-tickets/")) return "/my-tickets";
  if (pathname.startsWith("/e/")) return "/tickets";
  if (pathname.startsWith("/checkout")) return "/tickets";
  if (pathname.startsWith("/marketplace/")) return "/marketplace";
  if (pathname.startsWith("/organizer")) return "/organizers";
  return "/";
}

export const BackButton = ({ className = "", fallbackPath }: BackButtonProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // Real "back" to the previous page when there IS in-app history. React
    // Router sets location.key to "default" only for the very first entry
    // (direct landing / shared link / new tab) — there, popping would leave
    // the app or land on a blank page, so go to a sensible parent instead.
    if (location.key && location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate(fallbackPath ?? smartParent(location.pathname));
  };

  // No back arrow on the home page.
  if (location.pathname === "/") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={`gap-2 hover:bg-primary/10 ${className}`}
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  );
};
