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
    // If there's history to go back to, use it
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      // Otherwise go to fallback path
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

