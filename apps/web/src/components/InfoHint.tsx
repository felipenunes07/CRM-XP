export function InfoHint({ text }: { text: string }) {
  return (
    <button className="info-hint" type="button" title={text} aria-label={text}>
      i
    </button>
  );
}
