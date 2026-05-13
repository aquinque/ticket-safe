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
    <div className={`flex items-center gap-1.5 ${className}`}>
      {icon}
      <span className="font-medium">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help inline-flex" aria-label={explanation}>
            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center text-xs">
          {explanation}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
