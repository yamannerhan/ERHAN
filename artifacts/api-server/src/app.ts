import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildNotFoundSeoMeta, getSeoMetaForPath, injectSeoIntoHtml, SEO_BASE_URL, slugToCity } from "./lib/seo-render";
import {
  buildSitemapXml,
  generateBlogSitemapXml,
  generateCategoriesSitemapXml,
  generateCitiesSitemapXml,
  generateCompaniesSitemapXml,
  generateDistrictsSitemapXml,
  generateJobsSitemapXml,
  generatePagesSitemapXml,
  generateSitemapIndexXml,
  generateStaticSitemapIndexXml,
} from "./lib/seo-sitemap";

const app: Express = express();
const HOME_HERO_PRELOAD = [
  '<link rel="preload" as="image"',
  ' href="/banners/career-hero-1024.avif"',
  ' imagesrcset="/banners/career-hero-512.avif 512w, /banners/career-hero-1024.avif 1024w"',
  ' imagesizes="100vw" type="image/avif" fetchpriority="high" />',
].join("");

function injectHomeHeroPreload(html: string): string {
  return html.replace("</head>", `  ${HOME_HERO_PRELOAD}\n</head>`);
}

function sendXml(res: Response, xml: string): void {
  const body = Buffer.from(xml, "utf-8");
  res
    .setHeader("Content-Type", "application/xml; charset=utf-8")
    .setHeader("Content-Length", body.length)
    .setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600")
    .setHeader("X-Content-Type-Options", "nosniff")
    .status(200)
    .send(body);
}

/* ── Express app ─────────────────────────────────────────────────────────── */

app.use((req, res, next) => {
  const host = (req.headers.host ?? "").split(":")[0]?.toLowerCase() ?? "";
  const primaryHost = "ozelguvenlik.online";
  // www + IDN (özelgüvenlik.online → xn--zelgvenlik-dcb0f.online) → ana domain
  const aliasHosts = new Set([
    `www.${primaryHost}`,
    "xn--zelgvenlik-dcb0f.online",
    "www.xn--zelgvenlik-dcb0f.online",
    "özelgüvenlik.online",
    "www.özelgüvenlik.online",
  ]);
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProto || req.protocol;
  if ((host && host !== primaryHost && aliasHosts.has(host)) || (host === primaryHost && protocol !== "https")) {
    res.redirect(301, `${SEO_BASE_URL}${req.originalUrl}`);
    return;
  }
  next();
});

// Eski uzun il URL → kısa: /ankara-ozel-guvenlik-is-ilanlari → /ankara
app.use((req, res, next) => {
  const m = req.path.match(/^\/([a-z0-9-]+)-ozel-guvenlik-is-ilanlari\/?$/i);
  if (m) {
    const slug = m[1]!;
    if (slugToCity(slug)) {
      const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
      res.redirect(301, `${SEO_BASE_URL}/${slug}${query}`);
      return;
    }
  }
  next();
});

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
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.get(["/health", "/api/health", "/api/healthz"], (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/sitemap.xml", (req, res) => {
  void (async () => {
    try {
      const xml = await generateSitemapIndexXml();
      sendXml(res, xml);
    } catch (err) {
      logger.error({ err, path: req.path, userAgent: req.headers["user-agent"] }, "Sitemap generation failed");
      if (!res.headersSent) {
        sendXml(res, generateStaticSitemapIndexXml());
      }
    }
  })();
});

app.get("/sitemap-pages.xml", (_req, res) => sendXml(res, generatePagesSitemapXml()));
app.get("/sitemap-cities.xml", (_req, res) => sendXml(res, generateCitiesSitemapXml()));
app.get("/sitemap-districts.xml", (_req, res) => sendXml(res, generateDistrictsSitemapXml()));
app.get("/sitemap-categories.xml", (_req, res) => sendXml(res, generateCategoriesSitemapXml()));
app.get("/sitemap-companies.xml", (_req, res) => sendXml(res, generateCompaniesSitemapXml()));
app.get("/sitemap-blog.xml", (_req, res) => sendXml(res, generateBlogSitemapXml()));
app.get("/sitemap-jobs-:page.xml", (req, res) => {
  void (async () => {
    const page = Number(req.params["page"]);
    try {
      const xml = await generateJobsSitemapXml(page);
      if (!xml) {
        res.status(404).type("text/plain").send("Sitemap not found");
        return;
      }
      sendXml(res, xml);
    } catch (err) {
      logger.error({ err, page }, "Job sitemap generation failed");
      if (!res.headersSent) {
        res.setHeader("X-Sitemap-Degraded", "1");
        sendXml(res, buildSitemapXml([]));
      }
    }
  })();
});

app.get("/robots.txt", (_req, res) => {
  const body = [
    "User-agent: *",
    "Allow: /",
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
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  }));
  app.use(express.static(clientDistPath, { 
    index: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
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
        const seoHtml = meta ? injectSeoIntoHtml(clientIndexHtml!, meta) : clientIndexHtml!;
        const html = injectHomeHeroPreload(seoHtml);
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).type("html").send(html);
      } catch {
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).type("html").send(injectHomeHeroPreload(clientIndexHtml!));
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
        const meta = await getSeoMetaForPath(req.originalUrl);
        res.setHeader("Cache-Control", "private, no-store");
        if (!meta) {
          res.status(404).type("html").send(injectSeoIntoHtml(clientIndexHtml!, buildNotFoundSeoMeta()));
          return;
        }
        res.status(200).type("html").send(injectSeoIntoHtml(clientIndexHtml!, meta));
      } catch {
        res.status(500).type("html").send(injectSeoIntoHtml(clientIndexHtml!, buildNotFoundSeoMeta()));
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