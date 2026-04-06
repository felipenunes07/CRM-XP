export function StatCard({
  title,
  value,
  badge,
  helper,
  tone = "neutral",
}: {
  title: string;
  value: string;
  badge?: string;
  helper?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="eyebrow">{title}</p>
      <strong>{value}</strong>
      {badge ? <small className="stat-card-badge">{badge}</small> : null}
      {helper ? <span>{helper}</span> : null}
    </article>
  );
}
