import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { z } from "zod";

import { toAppError } from "../../src/http/toAppError.js";
import { ForbiddenError, NotFoundError } from "../../src/domain/errors.js";
import { errorBody } from "../../src/http/respond.js";

describe("toAppError", () => {
  it("passes an AppError through untouched", () => {
    const original = new NotFoundError("Community not found!");
    expect(toAppError(original)).toBe(original);
  });

  it("maps a ZodError to 400 with per-field details", () => {
    const parsed = z.object({ name: z.string() }).safeParse({ name: 42 });
    expect(parsed.success).toBe(false);

    const e = toAppError(parsed.error);
    expect(e.status).toBe(400);
    expect(e.code).toBe("validation_failed");
    expect(e.details).toHaveLength(1);
    expect((e.details as Array<{ path: string }>)[0]?.path).toBe("name");
  });

  it("maps a CastError to 400, not 500", () => {
    // This is what made GET /api/communities/levels return a 500.
    const e = toAppError(new mongoose.Error.CastError("ObjectId", "levels", "communityId"));
    expect(e.status).toBe(400);
    expect(e.message).toContain("communityId");
  });

  it("maps a duplicate key to 409 and names the field", () => {
    const dup = Object.assign(new Error("E11000 duplicate key"), {
      code: 11000,
      keyPattern: { email: 1 },
    });
    const e = toAppError(dup);
    expect(e.status).toBe(409);
    expect(e.message).toBe("email already exists");
  });

  it("maps JWT failures to 401, not 400", () => {
    expect(toAppError(new JsonWebTokenError("bad")).status).toBe(401);
    expect(toAppError(new TokenExpiredError("expired", new Date())).status).toBe(401);
  });

  it("maps an oversized body to 413", () => {
    const e = toAppError(Object.assign(new Error("too big"), { type: "entity.too.large" }));
    expect(e.status).toBe(413);
  });

  it("maps anything unrecognised to a non-exposing 500", () => {
    const e = toAppError(new Error("connect ECONNREFUSED 10.0.0.1:27017"));
    expect(e.status).toBe(500);
    expect(e.expose).toBe(false);
  });

  it("handles a non-Error throw", () => {
    const e = toAppError("just a string");
    expect(e.status).toBe(500);
    expect(e.expose).toBe(false);
  });
});

describe("errorBody", () => {
  it("keeps `error` a top-level string so existing clients keep working", () => {
    const body = errorBody(new ForbiddenError(), "req-1");
    expect(typeof body.error).toBe("string");
    expect(body).toEqual({
      error: "Unauthorised access",
      code: "forbidden",
      requestId: "req-1",
    });
  });

  it("never leaks an internal message or stack", () => {
    // The old code did res.status(500).send({error: "..." + error}), pasting
    // driver and Stream internals straight into the response.
    const body = errorBody(
      toAppError(new Error("connect ECONNREFUSED mongodb://user:pw@10.0.0.1")),
      "req-2",
    );
    expect(body.error).toBe("Something failed");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(body)).not.toContain("pw@");
  });
});
