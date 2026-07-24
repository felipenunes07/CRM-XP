export const WHATSAPP_MESSAGE_INGESTION_EXCLUDED_INSTANCE_LABELS = [
  "lili",
  "lili assistente",
] as const;

function normalizeInstanceLabel(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function isWhatsappMessageIngestionExcludedInstance(instance: {
  instanceName?: string | null;
  displayLabel?: string | null;
  assignedUserName?: string | null;
}) {
  const excluded = new Set<string>(WHATSAPP_MESSAGE_INGESTION_EXCLUDED_INSTANCE_LABELS);
  return [instance.instanceName, instance.displayLabel, instance.assignedUserName]
    .map(normalizeInstanceLabel)
    .some((label) => excluded.has(label));
}
