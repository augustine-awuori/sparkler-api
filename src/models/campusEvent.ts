import { Schema, model, type HydratedDocument } from "mongoose";

export interface ICampusEvent {
  title: string;
  description: string;
  place: string;
  startsAt: Date;
  endsAt?: Date;
  school?: string;
  /** The community running it, by slug. */
  community?: string;
  createdBy: string;
  goingCount: number;
}

export type CampusEventDoc = HydratedDocument<ICampusEvent>;

const schema = new Schema<ICampusEvent>({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  place: { type: String, required: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: Date,
  school: { type: String, index: true },
  community: { type: String, index: true },
  createdBy: { type: String, required: true, index: true },
  goingCount: { type: Number, default: 0 },
});

export const CampusEvent = model<ICampusEvent>("CampusEvent", schema);

export interface IEventRsvp {
  eventId: string;
  userId: string;
}

const rsvpSchema = new Schema<IEventRsvp>({
  eventId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
});
// What makes saying "going" twice count once.
rsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });

export const EventRsvp = model<IEventRsvp>("EventRsvp", rsvpSchema);
