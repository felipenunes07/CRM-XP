import type { JwtUser } from "../modules/platform/authService.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
    }
  }
}

export {};
