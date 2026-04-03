import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../lib/httpError.js";
import { verifyToken } from "./authService.js";

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "Autenticação obrigatória"));
    return;
  }

  try {
    request.user = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    next(new HttpError(401, "Token inválido"));
  }
}

export function requireRole(roles: Array<"ADMIN" | "MANAGER" | "SELLER">) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user) {
      next(new HttpError(401, "Autenticação obrigatória"));
      return;
    }

    if (!roles.includes(request.user.role)) {
      next(new HttpError(403, "Acesso negado"));
      return;
    }

    next();
  };
}
