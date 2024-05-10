import winston from "winston";
import "winston-mongodb";
import "express-async-errors";

export default function () {
  new winston.Logger({
    transports: [
      new winston.transports.File({
        handleExceptions: true,
        handleRejections: true,
        filename: "uncaughtExceptions.log",
      }),
    ],
  });

  process.on("unhandledRejection", (ex) => {
    throw ex;
  });

  winston.configure({
    transports: [new winston.transports.File({ filename: "logfile.log" })],
  });
}
