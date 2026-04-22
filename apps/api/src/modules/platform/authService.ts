import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";

export interface JwtUser {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SELLER";
  name: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: JwtUser["role"];
  name: string;
}

export async function ensureDefaultAdmin() {
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [env.DEFAULT_ADMIN_EMAIL]);
  if (existing.rowCount) {
    return;
  }

  const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, 10);
  await pool.query(
    `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, 'ADMIN')
    `,
    [env.DEFAULT_ADMIN_EMAIL, passwordHash, "Admin"],
  );
}

export async function login(email: string, password: string) {
  const result = await pool.query(
    "SELECT id, email, password_hash, role, name FROM users WHERE email = $1",
    [email.toLowerCase()],
  );

  const user = result.rows[0];
  if (!user) {
    throw new HttpError(401, "Credenciais inválidas");
  }

  const matches = await bcrypt.compare(password, user.password_hash as string);
  if (!matches) {
    throw new HttpError(401, "Credenciais inválidas");
  }

  await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

  const payload: JwtUser = {
    id: String(user.id),
    email: String(user.email),
    role: user.role as JwtUser["role"],
    name: String(user.name),
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  return { token, user: payload };
}

export async function createUserAccount(input: CreateUserInput) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.name.trim();

  if (!normalizedName) {
    throw new HttpError(400, "Nome do usuario obrigatorio");
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.rowCount) {
    throw new HttpError(409, "Ja existe um usuario com esse email");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const result = await pool.query(
    `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name, role, created_at
    `,
    [normalizedEmail, passwordHash, normalizedName, input.role],
  );

  return result.rows[0];
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtUser;
}

export async function listUsers() {
  const result = await pool.query(
    "SELECT id, email, role, name, created_at, last_login_at FROM users ORDER BY created_at ASC",
  );
  return result.rows;
}
