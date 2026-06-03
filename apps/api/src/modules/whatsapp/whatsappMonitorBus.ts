import { EventEmitter } from "events";

export interface MonitorStreamMessage {
  dealId: string;
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  fromMe: boolean;
  senderName: string | null;
  content: string;
  createdAt: string; // ISO
}

const bus = new EventEmitter();
bus.setMaxListeners(0); // Allow unlimited listeners for active agent screens

const CHANNEL = "wa-monitor-message";

export function publishMonitorMessage(msg: MonitorStreamMessage): void {
  bus.emit(CHANNEL, msg);
}

export function subscribeMonitorMessages(handler: (msg: MonitorStreamMessage) => void): () => void {
  bus.on(CHANNEL, handler);
  return () => bus.off(CHANNEL, handler); // Cleanup subscription
}
