import { createHash } from "node:crypto";

import type { ErrorEventInput } from "../domain/errorTracking.types.js";

/**
 * Decides which events are "the same error", so one bug is one row however
 * often it happens. Anything that changes between occurrences of one bug (line
 * numbers after a rebuild, ids in a message, bundle hashes) is stripped first.
 */

const FRAMES_USED = 3;

/** Replaces the parts of a message that differ between occurrences. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b[a-f\d]{24}\b/gi, "<id>")
    .replace(/\b[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\b/gi, "<uuid>")
    .replace(/(["'`])(?:(?!\1).){1,200}\1/g, "<str>")
    .replace(/\b0x[a-f\d]+\b/gi, "<hex>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export interface StackFrame {
  fn: string;
  file: string;
}

/** `index-3fa9c2.js?v=1` and `index-77b1e0.js` are the same file in two builds. */
function normalizeFile(raw: string): string {
  const withoutLocation = raw.replace(/:\d+(?::\d+)?$/, "").replace(/[?#].*$/, "");
  const base = withoutLocation.split(/[\\/]/).pop() ?? withoutLocation;
  // Only a segment with a digit in it looks like a build hash; "error-reporting" doesn't.
  return base.replace(/[-.](?=[\w]*\d)[\w]{6,}(?=\.\w+$)/i, "");
}

const V8_FRAME = /^\s*at\s+(?:(.+?)\s+\()?(?:address at\s+)?(.+?)\)?\s*$/;
const GECKO_FRAME = /^\s*(.*?)@(.+)$/;

/** Reads V8 / Hermes ("at fn (file:1:2)") and Safari / Firefox ("fn@file:1:2") frames. */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!match?.[2] || !/[:/]/.test(match[2])) continue;
    frames.push({ fn: (match[1] ?? "").trim() || "<anonymous>", file: normalizeFile(match[2].trim()) });
  }
  return frames;
}

function hash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

/**
 * A caught error's `context` label names its call site, so it groups on that.
 * An uncaught one has no label, so its top frames stand in for the call site.
 */
export function fingerprintOf(
  event: Pick<ErrorEventInput, "app" | "errorClass" | "message" | "stack" | "context">,
): string {
  const base = [event.app, event.errorClass, normalizeMessage(event.message)];
  if (event.context) return hash([...base, "context", event.context]);

  const frames = parseStack(event.stack).slice(0, FRAMES_USED);
  if (frames.length) return hash([...base, "frames", ...frames.map(({ fn, file }) => `${fn}@${file}`)]);

  return hash(base);
}

/**
 * Orders "3.0.10" after "3.0.9", and a web build "2026.11.08-ab12cd" after an
 * earlier date. Numbers compare as numbers; anything else as text.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(/[^a-z\d]+/i).filter(Boolean);
  const right = b.split(/[^a-z\d]+/i).filter(Boolean);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const bothNumbers = /^\d+$/.test(x) && /^\d+$/.test(y);
    const order = bothNumbers ? Number(x) - Number(y) : x.localeCompare(y);
    if (order !== 0) return Math.sign(order);
  }
  return 0;
}
