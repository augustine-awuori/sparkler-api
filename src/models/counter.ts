import { Schema, model } from "mongoose";

interface ICounter {
  _id: string;
  value: number;
}

const schema = new Schema<ICounter>({
  _id: { type: String, required: true },
  value: { type: Number, default: 0 },
});

const Counter = model<ICounter>("Counter", schema);

/** Atomic, so two requests at the same moment can never be given the same number. */
export async function nextInSequence(name: string): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  return counter.value;
}
