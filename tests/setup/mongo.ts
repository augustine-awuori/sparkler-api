import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | undefined;

export async function setup(): Promise<void> {
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  // startup/db.js reads `db` at import time, so this must be set before the
  // worker imports the app.
  process.env.db = mongod.getUri();
}

export async function teardown(): Promise<void> {
  await mongod?.stop();
}
