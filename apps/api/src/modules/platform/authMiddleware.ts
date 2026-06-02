import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../lib/httpError.js";
import { verifyToken, type JwtUser } from "./authService.js";
import { hasPermission } from "./permissionService.js";

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  if (request.method === "OPTIONS") {
    next();
    return;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "Autenticacao obrigatoria"));
    return;
  }

  try {
    request.user = await verifyToken(header.slice("Bearer ".length));
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Sessao invalida"));
  }
}

export function requireRole(roles: Array<JwtUser["role"]>) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user) {
      next(new HttpError(401, "Autenticacao obrigatoria"));
      return;
    }

    if (!roles.includes(request.user.role)) {
      next(new HttpError(403, "Acesso negado"));
      return;
    }

    next();
  };
}

export function requirePermission(permissionKey: string) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user) {
      next(new HttpError(401, "Autenticacao obrigatoria"));
      return;
    }

    if (!hasPermission(request.user.permissions ?? [], permissionKey)) {
      next(new HttpError(403, "Acesso negado"));
      return;
    }

    next();
  };
}
