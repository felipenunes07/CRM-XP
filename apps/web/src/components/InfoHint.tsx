import { useId } from "react";

export function InfoHint({ text }: { text: string }) {
  const tooltipId = useId();

  return (
    <span className="info-tooltip">
      <button className="info-hint" type="button" aria-label={text} aria-describedby={tooltipId}>
        i
      </button>
      <span id={tooltipId} role="tooltip" className="info-tooltip-bubble">
        {text}
      </span>
    </span>
  );
}
