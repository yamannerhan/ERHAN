import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const sanitizeLogText = (value: unknown) => String(value ?? "")
  .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+@/gi, "$1[REDACTED]@")
  .replace(/([?&](?:token|key|secret|password|code)=)[^&\s]+/gi, "$1[REDACTED]")
  .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, "$1[REDACTED]");

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body.phone",
    "req.body.phoneNumber",
    "req.body.password",
    "req.body.currentPassword",
    "req.body.newPassword",
    "req.body.code",
    "req.body.phoneCode",
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
    "*.apiToken",
    "*.password",
    "*.sessionString",
    "res.headers['set-cookie']",
  ],
  serializers: {
    err(error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        type: err.name,
        message: sanitizeLogText(err.message),
        stack: sanitizeLogText(err.stack),
      };
    },
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
