import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { db, listingsTable, usersTable, chatMessagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "./lib/logger";
import { getSeoMetaForPath, injectSeoIntoHtml } from "./lib/seo-render";

const app: Express = express();

/* ── Sitemap helpers ─────────────────────────────────────────────────────── */
const BASE_URL = "https://ozelguvenlik.online";

function toSlug(txt: string): string {
  return txt
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s")
    .replace(/ı/g,"i").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ALL_PROVINCES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın",
  "Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum",
  "Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun",
  "Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri",
  "Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin",
  "Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas",
  "Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray",
  "Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova",
  "Karabük","Kilis","Osmaniye","Düzce"
];

const SEO_DISTRICTS = [
  "Gebze","Darıca","Çayırova","Dilovası","İzmit","GOSB","TOSB",
  "İstanbul Anadolu Yakası","İstanbul Avrupa Yakası",
];

function provinceUrl(name: string) {
  return `${BASE_URL}/${toSlug(name)}-ozel-guvenlik-is-ilanlari`;
}
function districtUrl(name: string) {
  return `${BASE_URL}/${toSlug(name)}-ozel-guvenlik-is-ilanlari`;
}

async function generateSitemapXml(): Promise<string> {
  const staticUrls = [
    { url: `${BASE_URL}/`,          priority: "1.0", changefreq: "daily" },
    { url: `${BASE_URL}/ilanlar`,   priority: "0.9", changefreq: "daily" },
    { url: `${BASE_URL}/ilan-ekle`, priority: "0.5", changefreq: "monthly" },
    { url: `${BASE_URL}/cv-olustur`,priority: "0.6", changefreq: "monthly" },
    { url: `${BASE_URL}/part-time`,priority: "0.6", changefreq: "weekly" },
    { url: `${BASE_URL}/destek`,   priority: "0.5", changefreq: "monthly" },
    { url: `${BASE_URL}/sohbet`,   priority: "0.6", changefreq: "weekly" },
    { url: `${BASE_URL}/duyurular`,priority: "0.6", changefreq: "daily" },
  ];

  const provinceUrls = ALL_PROVINCES.map(name => ({
    url: provinceUrl(name), priority: "0.7", changefreq: "daily"
  }));
  const districtUrls = SEO_DISTRICTS.map(name => ({
    url: districtUrl(name), priority: "0.7", changefreq: "daily"
  }));

  const EXTRA_KEYWORDS = [
    "avm-guvenlik-is-ilanlari",
    "fabrika-guvenlik-is-ilanlari",
    "site-guvenlik-is-ilanlari",
    "silahli-guvenlik-is-ilanlari",
    "silahsiz-guvenlik-is-ilanlari",
  ];
  const keywordUrls = EXTRA_KEYWORDS.map(slug => ({
    url: `${BASE_URL}/${slug}`, priority: "0.7", changefreq: "weekly"
  }));

  let listingUrls: { url: string; priority: string; changefreq: string; lastmod: string }[] = [];
  try {
    const rows = await db
      .select({ id: listingsTable.id, updatedAt: listingsTable.updatedAt })
      .from(listingsTable)
      .where(eq(listingsTable.status, "active"))
      .orderBy(desc(listingsTable.updatedAt));
    listingUrls = rows.map(r => ({
      url: `${BASE_URL}/ilan/${r.id}`,
      priority: "0.8",
      changefreq: "daily",
      lastmod: (r.updatedAt ?? new Date()).toISOString(),
    }));
  } catch { /* ignore DB errors */ }

  const all = [...staticUrls, ...provinceUrls, ...districtUrls, ...keywordUrls, ...listingUrls];

  const entries = all.map(u => {
    const lm = "lastmod" in u ? u.lastmod : new Date().toISOString();
    return `  <url>\n    <loc>${u.url}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

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
    "Disallow: /admin/",
    "Disallow: /moderator/",
    "Disallow: /profil/",
    "Disallow: /api/",
    "",
    "User-agent: Googlebot",
    "Allow: /",
    "",
    "User-agent: Googlebot-Mobile",
    "Allow: /",
    "",
    "User-agent: Bingbot",
    "Allow: /",
    "",
    `Sitemap: ${BASE_URL}/sitemap.xml`,
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