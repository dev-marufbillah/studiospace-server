import type { AuthUser } from "../utils/jwt";

export type ValidationSource = "body" | "query" | "params";

declare global {
  namespace Express {
    interface Request {
      /** Verified JWT identity, attached by authenticate/optionalAuthenticate. */
      user?: AuthUser;
      /** Zod-validated input, attached by the validate() middleware. */
      validated?: Partial<Record<ValidationSource, unknown>>;
    }
  }
}

export {};
