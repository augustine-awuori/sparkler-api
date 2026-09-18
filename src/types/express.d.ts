import type { AuthUser } from "../domain/user.types.js";
import type { Logger } from "../utils/logger.js";

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by the `authenticate` middleware. OPTIONAL, because that is the
       * truth: politeAuth routes may have no user, and nothing is set before
       * the middleware runs. Controllers behind `auth` get a narrowed,
       * non-optional `user` via `authedHandler` instead of lying here.
       */
      user?: AuthUser;
      requestId: string;
      log: Logger;
    }
  }
}

export {};
