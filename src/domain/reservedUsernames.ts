/**
 * Names that can't be a username, because a page already lives at that address: the
 * web app's static routes outrank `/:handle`, so an account called "about" would have
 * no working profile link. Matches `RESERVED_HANDLES` in the web app's
 * `public-routes.ts`, and a new top-level route belongs in both.
 */
const RESERVED_USERNAMES = new Set([
  "home",
  "explore",
  "notifications",
  "students",
  "i",
  "about",
  "privacy",
  "mcp",
  "sparkle",
  "terms",
  "help",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}
