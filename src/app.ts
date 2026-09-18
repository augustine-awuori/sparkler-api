import compression from "compression";
import cors from "cors";
import express, { type Application } from "express";
import helmet from "helmet";

import { errorHandler } from "./http/middlewares/errorHandler.js";
import { notFoundHandler } from "./http/middlewares/notFound.js";
import { requestContext } from "./http/middlewares/requestContext.js";
import { mountRoutes } from "./routes/index.js";

/**
 * Builds the application without listening or touching the database, so tests
 * can mount it with supertest on an ephemeral port instead of fighting over a
 * fixed one.
 */
export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(express.json());
  app.use(
    cors({
      origin: "*",
      // Without this, browsers cannot read x-auth-token at all — the API was
      // telling clients to read a header CORS was hiding from them.
      exposedHeaders: ["x-auth-token", "x-request-id"],
    }),
  );
  app.use(requestContext);

  mountRoutes(app);

  // Order matters: 404 for unmatched routes, then the 4-arity error handler LAST.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
