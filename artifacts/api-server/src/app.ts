import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import {
  adminMutationRateLimit,
  corsOrigin,
  createRateLimit,
  redactProductionErrors,
  verifyMutationOrigin,
} from "./middlewares/security";
import {
  buildEmptyCityMeta,
  buildNotFoundSeoMeta,
  getSeoMetaForPath,
  injectSeoIntoHtml,
  SEO_BASE_URL,
  slugToCity,
} from "./lib/seo-render";
import {
  buildSitemapXml,
  generateBlogSitemapXml,
  generateNewsSitemapXml,
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
const trustProxyHops = Math.max(0, Number(process.env["TRUST_PROXY_HOPS"] ?? (process.env.NODE_ENV === "production" ? 1 : 0)));
app.set("trust proxy", trustProxyHops);
app.disable("x-powered-by");
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
  const protocol = req.protocol;
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
  logger.info({ method: req.method, path: req.path }, "Incoming request");
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
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      reportUri: ["/api/security/csp-report"],
      upgradeInsecureRequests: null,
    },
  },
  hsts: process.env["ENABLE_HSTS"] === "1"
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
    : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  next();
});
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Device-Id", "X-Cron-Secret"],
}));
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(redactProductionErrors);
app.use(verifyMutationOrigin);
app.use("/api/admin", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    adminMutationRateLimit(req, res, next);
    return;
  }
  next();
});

app.get(["/health", "/livez", "/api/health", "/api/healthz"], (_req, res) => {
  res.status(200).json({ status: "ok", service: "web" });
});

app.get(["/readyz", "/api/readyz"], async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready", database: "ok" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

const cspReportRateLimit = createRateLimit({ windowMs: 60_000, max: 30 });
app.post(
  "/api/security/csp-report",
  cspReportRateLimit,
  express.json({ type: ["application/csp-report", "application/reports+json"], limit: "64kb" }),
  (req, res) => {
    logger.warn({ report: req.body }, "CSP report");
    res.status(204).end();
  },
);

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

function asyncSitemap(handler: () => Promise<string>) {
  return (_req: express.Request, res: express.Response): void => {
    void handler()
      .then((xml) => sendXml(res, xml))
      .catch((err) => {
        logger.error({ err }, "Alt sitemap generation failed");
        if (!res.headersSent) res.status(503).type("text/plain").send("Sitemap temporarily unavailable");
      });
  };
}

app.get("/sitemap-pages.xml", asyncSitemap(generatePagesSitemapXml));
app.get("/sitemap-cities.xml", asyncSitemap(generateCitiesSitemapXml));
app.get("/sitemap-districts.xml", asyncSitemap(generateDistrictsSitemapXml));
app.get("/sitemap-categories.xml", asyncSitemap(generateCategoriesSitemapXml));
app.get("/sitemap-companies.xml", asyncSitemap(generateCompaniesSitemapXml));
app.get("/sitemap-blog.xml", (_req, res) => sendXml(res, generateBlogSitemapXml()));
app.get("/sitemap-news.xml", asyncSitemap(generateNewsSitemapXml));
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
      } catch (error) {
        const cityMatch = req.path.match(/^\/([a-z0-9-]+)\/?$/i);
        const slug = cityMatch?.[1];
        const city = slug ? slugToCity(slug) : null;
        if (city && slug) {
          logger.error({ err: error, city, path: req.path }, "City SEO render failed; serving empty-city fallback");
          res
            .setHeader("Cache-Control", "private, no-store")
            .status(200)
            .type("html")
            .send(injectSeoIntoHtml(clientIndexHtml!, buildEmptyCityMeta(city, slug)));
          return;
        }
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