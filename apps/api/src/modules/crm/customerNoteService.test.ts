import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("../../db/client.js", () => ({ pool: { query: poolQuery } }));

import { createCustomerNote, deleteCustomerNote } from "./customerNoteService.js";
import type { JwtUser } from "../platform/authService.js";

const seller: JwtUser = { id: "seller-1", email: "ana@example.com", name: "Ana", role: "SELLER", appRole: "vendas" };
const otherSeller: JwtUser = { ...seller, id: "seller-2", name: "Bia" };
const manager: JwtUser = { ...seller, id: "manager-1", name: "Gestor", role: "MANAGER", appRole: "operacional" };

describe("customerNoteService", () => {
  beforeEach(() => {
    poolQuery.mockReset();
  });

  it("saves the note with its author and mirrors it into internal_notes", async () => {
    poolQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "note-1",
          customer_id: "customer-1",
          body: "Pediu retorno sexta",
          outcome: "callback",
          author_user_id: seller.id,
          author_name: seller.name,
          created_at: "2026-10-02T13:00:00.000Z",
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const note = await createCustomerNote("customer-1", { body: "  Pediu retorno sexta ", outcome: "callback" }, seller);

    expect(note).toMatchObject({ body: "Pediu retorno sexta", outcome: "callback", authorName: "Ana" });
    expect(poolQuery.mock.calls[1]?.[1]).toEqual(["customer-1", "Pediu retorno sexta", "callback", seller.id, "Ana"]);
    expect(poolQuery.mock.calls[2]?.[0]).toContain("SET internal_notes");
  });

  it("returns 404 when the customer does not exist", async () => {
    poolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(createCustomerNote("missing", { body: "oi" }, seller)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("only lets the author or a manager delete a note", async () => {
    poolQuery.mockResolvedValue({ rowCount: 1, rows: [{ author_user_id: seller.id }] });

    await expect(deleteCustomerNote("customer-1", "note-1", otherSeller)).rejects.toMatchObject({ statusCode: 403 });
    await expect(deleteCustomerNote("customer-1", "note-1", seller)).resolves.toBeUndefined();
    await expect(deleteCustomerNote("customer-1", "note-1", manager)).resolves.toBeUndefined();
  });
});
