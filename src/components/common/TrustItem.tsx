import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TrustItemProps {
  icon: ReactNode;
  label: string;
  explanation: string;
  className?: string;
}

export function TrustItem({ icon, label, explanation, className = "" }: TrustItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm ${className}`}
          aria-describedby={undefined}
        >
          {icon}
          <span className="font-medium">{label}</span>
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-center">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}
