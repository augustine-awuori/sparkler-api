import express from "express";
import serverless from "serverless-http";

import db from "./startup/db.js";
import logger from "./startup/logging.js";
import prod from "./startup/prod.js";
import routes from "./startup/routes.js";

const app = express();

logger();
db();
prod(app);
routes(app);

export default serverless(app);