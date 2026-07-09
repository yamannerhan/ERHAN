import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { getSeoMetaForPath, injectSeoIntoHtml, SEO_BASE_URL } from "./lib/seo-render";
import { generateSitemapXml } from "./lib/seo-sitemap";

const app: Express = express();

/* ── Express app ─────────────────────────────────────────────────────────── */

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

app.get("/sitemap.xml", async (_req, res) => {
  try {
    const xml = await generateSitemapXml();
    res
      .setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
      .setHeader("Pragma", "no-cache")
      .setHeader("Expires", "0")
      .type("application/xml")
      .send(xml);
  } catch {
    res.status(500).type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><error/>`);
  }
});

app.get("/robots.txt", (_req, res) => {
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    "Disallow: /ilanlar?",
    "",
    `Sitemap: ${SEO_BASE_URL}/sitemap.xml`,
    "",
  ].join("\n");
  res
    .setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    .setHeader("Pragma", "no-cache")
    .setHeader("Expires", "0")
    .type("text/plain")
    .send(body);
});

const clientDistPath = path.join(process.cwd(), "artifacts", "ozel-guvenlik", "dist", "public");
const clientIndexPath = path.join(clientDistPath, "index.html");
const clientIndexHtml = fs.existsSync(clientIndexPath)
  ? fs.readFileSync(clientIndexPath, "utf-8")
  : null;

if (clientIndexHtml) {
  logger.info({ clientDistPath }, "Serving frontend static files");
  app.use("/assets", express.static(path.join(clientDistPath, "assets"), {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }));
  app.use(express.static(clientDistPath, { 
    index: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }));
} else {
  logger.error({ clientIndexPath }, "Frontend index.html not found");
}

app.get("/", (_req, res) => {
  if (clientIndexHtml) {
    void (async () => {
      try {
        const meta = await getSeoMetaForPath("/");
        const html = meta ? injectSeoIntoHtml(clientIndexHtml!, meta) : clientIndexHtml!;
        res.status(200).type("html").send(html);
      } catch {
        res.status(200).type("html").send(clientIndexHtml!);
      }
    })();
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
    void (async () => {
      try {
        const meta = await getSeoMetaForPath(req.path);
        const html = meta ? injectSeoIntoHtml(clientIndexHtml!, meta) : clientIndexHtml!;
        res.status(200).type("html").send(html);
      } catch {
        res.status(200).type("html").send(clientIndexHtml!);
      }
    })();
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