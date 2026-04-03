import { sha256 } from "../../lib/normalize.js";

export function buildSaleLineFingerprint(input: {
  sourceSystem?: string;
  saleDate: string;
  customerCode: string;
  orderNumber: string;
  sku: string | null;
  quantity: number;
  lineTotal: number;
}) {
  return sha256([
    input.saleDate,
    input.customerCode,
    input.orderNumber,
    input.sku,
    input.quantity.toFixed(2),
    input.lineTotal.toFixed(2),
  ]);
}
