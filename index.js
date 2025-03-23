import express from "express";

import db from "./startup/db.js";
import logger from "./startup/logging.js";
import prod from "./startup/prod.js";
import routes from "./startup/routes.js";

const app = express();

logger();
db();
prod(app);
routes(app);

const port = process.env.PORT || 3000;
const server = app.listen(port, () =>
    console.log(`Server is listening on port ${port}`)
);

export default server;
