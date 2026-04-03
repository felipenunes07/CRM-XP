import type { SourceSystem } from "@olist-crm/shared";

export interface NormalizedSaleRow {
  sourceSystem: SourceSystem;
  sourceFileId: string | null;
  importRunId: string | null;
  externalOrderId: string | null;
  externalCustomerId: string | null;
  saleDate: string;
  itemDescription: string;
  quantity: number;
  customerCode: string;
  unitPrice: number;
  lineTotal: number;
  orderNumber: string;
  sku: string | null;
  customerLabel: string;
  attendantName: string | null;
  orderStatus: string;
  orderUpdatedAt: string | null;
  fingerprint: string;
  rawPayload: Record<string, unknown>;
}
