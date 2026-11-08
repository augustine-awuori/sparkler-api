import { config } from "../config/index.js";
import type { DeveloperDoc } from "../models/developer.js";
import type { IErrorGroup } from "../models/errorGroup.js";
import type { MailInput } from "./mail.js";

/**
 * Emails for the error tracker's team workflow. Only the group's class and
 * message go in them, never event details, which may hold user data.
 */

type GroupSummary = Pick<IErrorGroup, "errorClass" | "message" | "app" | "eventCount" | "context"> & {
  _id: { toString(): string };
};

export interface MailPerson {
  name: string;
  email: string;
}

const firstName = (name = ""): string => name.trim().split(/\s+/)[0] || "there";
const FOOTNOTE = "You're receiving this because you're on the Sparkler errors team.";

function groupUrl(group: GroupSummary): string {
  return `${config().errorsDashboardUrl}/errors/${group._id.toString()}`;
}

function title(group: GroupSummary): string {
  const message = group.message.length > 80 ? `${group.message.slice(0, 77)}…` : group.message;
  return `${group.errorClass}: ${message || group.context || "no message"}`;
}

function summary(group: GroupSummary): string {
  const times = group.eventCount === 1 ? "once" : `${group.eventCount} times`;
  return `${title(group)}\nOn ${group.app}, seen ${times}.`;
}

function openButton(group: GroupSummary) {
  return { label: "Open the error", url: groupUrl(group) };
}

export function assignedMail(group: GroupSummary, assignee: MailPerson, assigner: MailPerson): MailInput {
  return {
    to: assignee.email,
    subject: `[Errors] ${assigner.name} assigned you: ${title(group)}`,
    heading: "An error was assigned to you",
    preheader: `${assigner.name} would like you to take this one.`,
    message: [
      `Hi ${firstName(assignee.name)}, ${assigner.name} assigned you this error.`,
      summary(group),
      "Accept it to start working on it, or reject it with a reason so it can go to someone else.",
    ].join("\n\n"),
    cta: openButton(group),
    footnote: FOOTNOTE,
  };
}

export function assignmentAnsweredMail(
  group: GroupSummary,
  assigner: MailPerson,
  assignee: MailPerson,
  answer: { accepted: true } | { accepted: false; reason?: string },
): MailInput {
  const verb = answer.accepted ? "accepted" : "rejected";
  const reason = !answer.accepted && answer.reason ? [`Their reason: ${answer.reason}`] : [];
  return {
    to: assigner.email,
    subject: `[Errors] ${assignee.name} ${verb}: ${title(group)}`,
    heading: `${assignee.name} ${verb} the error`,
    message: [
      `Hi ${firstName(assigner.name)}, ${assignee.name} ${verb} the error you assigned them.`,
      summary(group),
      ...reason,
      ...(answer.accepted ? [] : ["It's unassigned again, so it can go to someone else."]),
    ].join("\n\n"),
    cta: openButton(group),
    footnote: FOOTNOTE,
  };
}

export function resolvedMail(
  group: GroupSummary,
  assigner: MailPerson,
  resolver: MailPerson,
  note?: string,
): MailInput {
  return {
    to: assigner.email,
    subject: `[Errors] ${resolver.name} resolved: ${title(group)}`,
    heading: `${resolver.name} resolved the error`,
    message: [
      `Hi ${firstName(assigner.name)}, ${resolver.name} marked the error you assigned as resolved.`,
      summary(group),
      ...(note ? [`Their note: ${note}`] : []),
      "If it happens again in a newer version, it reopens by itself.",
    ].join("\n\n"),
    cta: openButton(group),
    footnote: FOOTNOTE,
  };
}

export function accessRequestedMails(admins: readonly DeveloperDoc[], requester: MailPerson): MailInput[] {
  return admins.map((admin) => ({
    to: admin.email,
    subject: `[Errors] ${requester.name} asked to join the team`,
    heading: "Someone asked to join the errors team",
    message: `${requester.name} (${requester.email}) asked for access to the Sparkler errors dashboard.\n\nApprove or decline them on the Team page.`,
    cta: { label: "Open the Team page", url: `${config().errorsDashboardUrl}/team` },
    footnote: FOOTNOTE,
  }));
}

export function accessApprovedMail(developer: MailPerson): MailInput {
  return {
    to: developer.email,
    subject: "[Errors] You're on the Sparkler errors team",
    heading: `You're in, ${firstName(developer.name)}`,
    message: "Your access to the Sparkler errors dashboard was approved. Errors assigned to you will arrive by email.",
    cta: { label: "Open the dashboard", url: config().errorsDashboardUrl },
    footnote: FOOTNOTE,
  };
}
