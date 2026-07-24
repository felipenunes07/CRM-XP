import { Users, UserCheck, UserMinus, UserX, Activity } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function StatCard({
  title,
  value,
  badge,
  helper,
  helperTitle,
  hoverDetail,
  tone = "neutral",
  onClick,
}: {
  title: string;
  value: string;
  badge?: string;
  helper?: string;
  helperTitle?: string;
  hoverDetail?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  onClick?: () => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [hoverPosition, setHoverPosition] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  } | null>(null);

  const Icon =
    tone === "success"
      ? UserCheck
      : tone === "warning"
        ? UserMinus
      : tone === "danger"
        ? UserX
      : tone === "primary"
        ? Activity
      : title.toLowerCase().includes("frequencia")
      ? Activity
      : Users;

  function showHoverDetail() {
    if (!hoverDetail || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(320, window.innerWidth - 32);
    const left = Math.min(
      Math.max(16, rect.left + rect.width / 2 - popoverWidth / 2),
      window.innerWidth - popoverWidth - 16,
    );
    const placement = rect.top >= 300 ? "above" : "below";

    setHoverPosition({
      left,
      top: placement === "above" ? rect.top - 12 : rect.bottom + 12,
      placement,
    });
  }

  function hideHoverDetail() {
    setHoverPosition(null);
  }

  return (
    <article 
      ref={cardRef}
      className={`stat-card tone-${tone} ${onClick ? 'interactive' : ''} ${hoverDetail ? 'has-hover-detail' : ''}`}
      onClick={onClick}
      onMouseEnter={showHoverDetail}
      onMouseLeave={hideHoverDetail}
      onFocus={showHoverDetail}
      onBlur={hideHoverDetail}
      tabIndex={hoverDetail ? 0 : undefined}
    >
      <div className="stat-card-header">
        <p className="stat-card-title">{title}</p>
        <div className={`stat-card-icon tone-${tone}`}>
          <Icon size={20} strokeWidth={2.5} />
        </div>
      </div>
      <div className="stat-card-body">
        <strong>{value}</strong>
        <div className="stat-card-footer">
          {badge ? <span className={`stat-card-badge tone-${tone}`}>{badge}</span> : null}
          {helper ? <span className="stat-card-helper" title={hoverDetail ? undefined : helperTitle}>{helper}</span> : null}
        </div>
      </div>
      {hoverDetail && hoverPosition
        ? createPortal(
            <div
              className={`stat-card-hover-detail is-${hoverPosition.placement}`}
              role="tooltip"
              style={{ left: hoverPosition.left, top: hoverPosition.top }}
            >
              {hoverDetail}
            </div>,
            document.body,
          )
        : null}
    </article>
  );
}
