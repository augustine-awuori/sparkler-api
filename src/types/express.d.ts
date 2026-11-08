import type { AuthUser } from "../domain/user.types.js";
import type { StaffMember } from "../services/developers.js";
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
      /** Set by `requireIssueStaff`: the team member making the request. */
      staff?: StaffMember;
      requestId: string;
      log: Logger;
    }
  }
}

export {};
