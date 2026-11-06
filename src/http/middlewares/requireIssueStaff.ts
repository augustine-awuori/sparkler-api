import { requireAdmin } from "./requireAdmin.js";

/**
 * Who may work on issues. Admins today, and the one place to admit an IT team
 * role when their app arrives, so no route has to change.
 */
export const requireIssueStaff = requireAdmin;
