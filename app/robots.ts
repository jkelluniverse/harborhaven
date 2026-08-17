import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/e/", "/api/"] }],
    sitemap: "https://harborhavenhomewatch.com/sitemap.xml",
  };
}
