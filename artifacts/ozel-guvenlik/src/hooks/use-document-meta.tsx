import { useEffect } from "react";

export interface DocumentMeta {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object | object[];
}

function setMetaTag(selector: string, attr: "name" | "property", value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, selector.replace(/\[.*="(.*)"\]/, "$1"));
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function removeMetaTag(selector: string) {
  const el = document.head.querySelector(selector);
  if (el) el.remove();
}

function setLinkRel(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

const OG_PROPS = ["og:title", "og:description", "og:image", "og:type", "og:url", "og:locale", "og:site_name"];
const TW_PROPS = ["twitter:card", "twitter:title", "twitter:description", "twitter:image"];

export function useDocumentMeta(meta: DocumentMeta) {
  useEffect(() => {
    const originalTitle = document.title;

    if (meta.title) document.title = meta.title;
    if (meta.description) setMetaTag('meta[name="description"]', "name", meta.description);
    if (meta.keywords) setMetaTag('meta[name="keywords"]', "name", meta.keywords);
    if (meta.canonical) {
      setLinkRel("canonical", meta.canonical);
      setMetaTag('meta[property="og:url"]', "property", meta.canonical);
    }
    if (meta.ogImage) {
      setMetaTag('meta[property="og:image"]', "property", meta.ogImage);
      setMetaTag('meta[name="twitter:image"]', "name", meta.ogImage);
    }
    if (meta.ogType) setMetaTag('meta[property="og:type"]', "property", meta.ogType);

    /* hreflang */
    const trAlt = document.querySelector<HTMLLinkElement>('link[hreflang="tr-TR"]');
    if (!trAlt) {
      const link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", "tr-TR");
      link.setAttribute("href", meta.canonical ?? window.location.href.split("?")[0]);
      document.head.appendChild(link);
    } else if (meta.canonical) {
      trAlt.setAttribute("href", meta.canonical);
    }

    /* JSON-LD */
    const existingLd = document.head.querySelectorAll('script[data-dynamic-ld="1"]');
    existingLd.forEach(e => e.remove());

    if (meta.jsonLd) {
      const items = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
      items.forEach(item => {
        const script = document.createElement("script");
        script.setAttribute("type", "application/ld+json");
        script.setAttribute("data-dynamic-ld", "1");
        script.textContent = JSON.stringify(item);
        document.head.appendChild(script);
      });
    }

    return () => {
      if (meta.title) document.title = originalTitle;
      if (meta.description) removeMetaTag('meta[name="description"]');
      if (meta.keywords) removeMetaTag('meta[name="keywords"]');
    };
  }, [meta.title, meta.description, meta.keywords, meta.canonical, meta.ogImage, meta.ogType, meta.jsonLd]);
}
