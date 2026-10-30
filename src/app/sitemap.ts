import type { MetadataRoute } from "next";
import { getRooms } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rooms = await getRooms().catch(() => []);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/free`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/classes`, changeFrequency: "weekly", priority: 0.7 },
    ...rooms.map((r) => ({ url: `${SITE_URL}/room/${encodeURIComponent(r.id)}`, changeFrequency: "daily" as const, priority: 0.6 })),
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
