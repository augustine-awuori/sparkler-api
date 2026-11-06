import type { ReviewQueueItemResponse } from "@stream-io/node-sdk";
import { z } from "zod";

import { streamClient } from "./stream.js";

const ENTITY_KINDS = {
  "stream:feeds:v3:activity": "sparkle",
  "stream:feeds:v3:comment": "reply",
} as const;

type ReportedEntity = keyof typeof ENTITY_KINDS;
export type ReportedKind = (typeof ENTITY_KINDS)[ReportedEntity];

const PAGE_SIZE = 25;

export const moderationDecisionSchema = z.object({
  decision: z.enum(["keep", "remove"]),
  kind: z.enum(["sparkle", "reply"]),
});

export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;

/** Includes the real author, even of an anonymous post: staff need it, and only staff read this. */
export function toQueueItem(item: ReviewQueueItemResponse) {
  return {
    id: item.id,
    kind: ENTITY_KINDS[item.entity_type as ReportedEntity] ?? "sparkle",
    entityId: item.entity_id,
    authorId: item.entity_creator_id ?? null,
    flagCount: item.flags_count,
    reasons: [...new Set((item.flags ?? []).flatMap((flag) => flag.reason ?? []))],
    // The SDK's type for `activity` leaves out the text Stream sends with it.
    text:
      (item.activity as { text?: string } | undefined)?.text ??
      item.moderation_payload?.texts?.[0] ??
      "",
    createdAt: item.created_at,
  };
}

export async function readReviewQueue(next?: string) {
  const answer = await streamClient().moderation.queryReviewQueue({
    filter: { reviewed: false, entity_type: { $in: Object.keys(ENTITY_KINDS) } },
    sort: [{ field: "created_at", direction: -1 }],
    limit: PAGE_SIZE,
    ...(next && { next }),
  });
  return { items: answer.items.map(toQueueItem), next: answer.next ?? null };
}

/** What each decision asks of Stream, so the two kinds of removal can't be mixed up. */
const ACTIONS = {
  keep: () => ({ action_type: "mark_reviewed", mark_reviewed: {} }),
  remove: (kind: ReportedKind) =>
    kind === "reply"
      ? { action_type: "delete_comment", delete_comment: {} }
      : { action_type: "delete_activity", delete_activity: {} },
} as const;

export async function decideReport(
  itemId: string,
  moderatorId: string,
  { decision, kind }: ModerationDecision,
): Promise<void> {
  await streamClient().moderation.submitAction({
    item_id: itemId,
    user_id: moderatorId,
    ...ACTIONS[decision](kind),
  } as Parameters<ReturnType<typeof streamClient>["moderation"]["submitAction"]>[0]);
}
