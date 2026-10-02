import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listCustomerNotesMock, createCustomerNoteMock, deleteCustomerNoteMock, listLatestCustomerNotesMock } = vi.hoisted(() => ({
  listCustomerNotesMock: vi.fn(),
  createCustomerNoteMock: vi.fn(),
  deleteCustomerNoteMock: vi.fn(),
  listLatestCustomerNotesMock: vi.fn(),
}));

vi.mock("./modules/crm/customerNoteService.js", () => ({
  listCustomerNotes: listCustomerNotesMock,
  createCustomerNote: createCustomerNoteMock,
  deleteCustomerNote: deleteCustomerNoteMock,
  listLatestCustomerNotes: listLatestCustomerNotesMock,
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (request: any, _response: unknown, next: () => void) => {
    request.user = { id: "user-1", email: "ana@example.com", name: "Ana", role: "SELLER", appRole: "vendas" };
    next();
  },
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  requirePermission: () => (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import { createApp } from "./app.js";

const note = {
  id: "note-1",
  customerId: "customer-1",
  body: "Não atendeu, tentar amanhã cedo.",
  outcome: "no_answer",
  authorUserId: "user-1",
  authorName: "Ana",
  createdAt: "2026-10-02T13:00:00.000Z",
};

describe("customer notes routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the note history of a customer", async () => {
    listCustomerNotesMock.mockResolvedValue([note]);

    const response = await request(createApp()).get("/api/customers/customer-1/notes");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([note]);
    expect(listCustomerNotesMock).toHaveBeenCalledWith("customer-1");
  });

  it("creates a note authored by the logged user", async () => {
    createCustomerNoteMock.mockResolvedValue(note);

    const response = await request(createApp())
      .post("/api/customers/customer-1/notes")
      .send({ body: "  Não atendeu, tentar amanhã cedo.  ", outcome: "no_answer" });

    expect(response.status).toBe(201);
    expect(createCustomerNoteMock).toHaveBeenCalledWith(
      "customer-1",
      { body: "Não atendeu, tentar amanhã cedo.", outcome: "no_answer" },
      expect.objectContaining({ id: "user-1", name: "Ana" }),
    );
  });

  it("rejects empty notes and unknown outcomes", async () => {
    const app = createApp();

    const empty = await request(app).post("/api/customers/customer-1/notes").send({ body: "   " });
    const badOutcome = await request(app).post("/api/customers/customer-1/notes").send({ body: "ok", outcome: "maybe" });

    expect(empty.status).toBe(400);
    expect(badOutcome.status).toBe(400);
    expect(createCustomerNoteMock).not.toHaveBeenCalled();
  });

  it("deletes a note", async () => {
    deleteCustomerNoteMock.mockResolvedValue(undefined);

    const response = await request(createApp()).delete("/api/customers/customer-1/notes/note-1");

    expect(response.status).toBe(204);
    expect(deleteCustomerNoteMock).toHaveBeenCalledWith("customer-1", "note-1", expect.objectContaining({ id: "user-1" }));
  });

  it("returns the latest note of each customer", async () => {
    listLatestCustomerNotesMock.mockResolvedValue([note]);

    const response = await request(createApp()).get("/api/customer-notes/latest");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([note]);
  });
});
