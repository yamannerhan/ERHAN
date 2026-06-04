import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path, url: req.url }, "Incoming request");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get(["/health", "/api/health", "/api/healthz"], (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

const clientDistPath = path.join(process.cwd(), "artifacts", "ozel-guvenlik", "dist", "public");
const clientIndexPath = path.join(clientDistPath, "index.html");
const clientIndexHtml = fs.existsSync(clientIndexPath)
  ? fs.readFileSync(clientIndexPath, "utf-8")
  : null;

if (clientIndexHtml) {
  logger.info({ clientDistPath }, "Serving frontend static files");
  app.use("/assets", express.static(path.join(clientDistPath, "assets")));
  app.use(express.static(clientDistPath, { index: false }));
} else {
  logger.error({ clientIndexPath }, "Frontend index.html not found");
}

app.get("/", (_req, res) => {
  if (clientIndexHtml) {
    res.status(200).type("html").send(clientIndexHtml);
    return;
  }

  res.status(200).type("text/plain").send("OK Railway root works");
});

app.use("/api/avatars", express.static(path.join(process.cwd(), "uploads", "avatars")));
app.use("/api", router);

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }

  if (clientIndexHtml) {
    res.status(200).type("html").send(clientIndexHtml);
    return;
  }

  res.status(404).type("text/plain").send("Frontend not found");
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled request error");
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;