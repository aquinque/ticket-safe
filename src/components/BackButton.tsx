import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  className?: string;
  fallbackPath?: string;
}

export const BackButton = ({ className = "", fallbackPath = "/" }: BackButtonProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // Go back only when there's REAL in-app history. React Router sets
    // location.key to "default" for the very first entry (direct landing,
    // shared link, new tab) — navigate(-1) there would leave the app or land
    // on a blank page, so fall back to a safe in-app path instead.
    if (location.key && location.key !== "default") {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };

  // Don't show back button on home page
  if (location.pathname === "/") {
    return null;
  }

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

