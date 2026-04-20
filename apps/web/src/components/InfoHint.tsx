import { useId } from "react";
import { Info } from "lucide-react";

export function InfoHint({ text }: { text: string }) {
  const tooltipId = useId();

  return (
    <span className="info-tooltip">
      <button className="info-hint" type="button" aria-label={text} aria-describedby={tooltipId}>
        <Info size={14} />
      </button>
      <span id={tooltipId} role="tooltip" className="info-tooltip-bubble">
        {text}
      </span>
    </span>
  );
}
