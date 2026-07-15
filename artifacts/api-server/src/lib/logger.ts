import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body.phone",
    "req.body.phoneNumber",
    "req.body.apiHash",
    "req.body.sessionString",
    "req.body.token",
    "req.body.text",
    "phone",
    "phoneNumber",
    "apiHash",
    "sessionString",
    "token",
    "rawText",
    "text",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
