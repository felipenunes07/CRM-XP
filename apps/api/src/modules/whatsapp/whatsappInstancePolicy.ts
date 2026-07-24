export function isWhatsappMessageIngestionExcludedInstance(instance: {
  messagesEnabled?: boolean | null;
}) {
  return instance.messagesEnabled === false;
}
