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
    // Real "go back" to the previous page when there's in-app history;
    // otherwise fall back to a sensible path (e.g. when landing here directly).
    if (window.history.length > 1) {
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

