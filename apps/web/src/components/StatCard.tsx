import { Users, UserCheck, UserMinus, UserX, Activity } from "lucide-react";

export function StatCard({
  title,
  value,
  badge,
  helper,
  tone = "neutral",
  onClick,
}: {
  title: string;
  value: string;
  badge?: string;
  helper?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  onClick?: () => void;
}) {
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

  return (
    <article 
      className={`stat-card tone-${tone} ${onClick ? 'interactive' : ''}`}
      onClick={onClick}
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
          {helper ? <span className="stat-card-helper">{helper}</span> : null}
        </div>
      </div>
    </article>
  );
}
