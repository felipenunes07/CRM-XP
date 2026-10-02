import type { CustomerNote, CustomerNoteOutcome } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";

const NOTE_COLUMNS = `
  n.id,
  n.customer_id,
  n.body,
  n.outcome,
  n.author_user_id,
  COALESCE(p.full_name, n.author_name) AS author_name,
  n.created_at
`;

function mapNote(row: Record<string, unknown>): CustomerNote {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    body: String(row.body ?? ""),
    outcome: (row.outcome as CustomerNoteOutcome | null) ?? null,
    authorUserId: row.author_user_id ? String(row.author_user_id) : null,
    authorName: String(row.author_name ?? ""),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

// Mantém customers.internal_notes igual à observação mais recente, porque a
// análise do cliente e outras telas ainda leem esse campo.
async function syncLatestInternalNote(customerId: string) {
  await pool.query(
    `
      UPDATE customers
      SET internal_notes = COALESCE((
        SELECT body FROM customer_notes
        WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      ), ''), updated_at = NOW()
      WHERE id = $1
    `,
    [customerId],
  );
}

export async function listCustomerNotes(customerId: string): Promise<CustomerNote[]> {
  const result = await pool.query(
    `
      SELECT ${NOTE_COLUMNS}
      FROM customer_notes n
      LEFT JOIN profiles p ON p.id = n.author_user_id
      WHERE n.customer_id = $1
      ORDER BY n.created_at DESC
    `,
    [customerId],
  );

  return result.rows.map(mapNote);
}

// Última observação de cada cliente, para a coluna da lista de clientes.
export async function listLatestCustomerNotes(): Promise<CustomerNote[]> {
  const result = await pool.query(
    `
      SELECT DISTINCT ON (n.customer_id) ${NOTE_COLUMNS}
      FROM customer_notes n
      LEFT JOIN profiles p ON p.id = n.author_user_id
      ORDER BY n.customer_id, n.created_at DESC
    `,
  );

  return result.rows.map(mapNote);
}

export async function createCustomerNote(
  customerId: string,
  input: { body: string; outcome?: CustomerNoteOutcome | null },
  user: JwtUser,
): Promise<CustomerNote> {
  const body = input.body.trim();
  if (!body) {
    throw new HttpError(400, "Escreva a observação antes de salvar");
  }

  const customer = await pool.query("SELECT 1 FROM customers WHERE id = $1", [customerId]);
  if (!customer.rowCount) {
    throw new HttpError(404, "Cliente não encontrado");
  }

  const inserted = await pool.query(
    `
      INSERT INTO customer_notes (customer_id, body, outcome, author_user_id, author_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, customer_id, body, outcome, author_user_id, author_name, created_at
    `,
    [customerId, body, input.outcome ?? null, user.id, user.name],
  );

  await syncLatestInternalNote(customerId);
  return mapNote(inserted.rows[0]);
}

export async function deleteCustomerNote(customerId: string, noteId: string, user: JwtUser) {
  const existing = await pool.query(
    "SELECT author_user_id FROM customer_notes WHERE id = $1 AND customer_id = $2",
    [noteId, customerId],
  );
  if (!existing.rowCount) {
    throw new HttpError(404, "Observação não encontrada");
  }

  const isAuthor = existing.rows[0].author_user_id === user.id;
  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  if (!isAuthor && !isManager) {
    throw new HttpError(403, "Só quem escreveu a observação pode apagá-la");
  }

  await pool.query("DELETE FROM customer_notes WHERE id = $1", [noteId]);
  await syncLatestInternalNote(customerId);
}
