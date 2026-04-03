export function StatCard({
  title,
  value,
  helper,
  tone = "neutral",
}: {
  title: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p className="eyebrow">{title}</p>
      <strong>{value}</strong>
      {helper ? <span>{helper}</span> : null}
    </article>
  );
}
