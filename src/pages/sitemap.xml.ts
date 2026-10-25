import type { APIRoute } from "astro";
import { projects } from "../data/projects";
import book from "../data/book.json";
export const GET: APIRoute = ({ site }) => {
  const routes = [
    "/",
    "/bench/",
    "/book/",
    ...book.chapters.map((chapter) => `/book/${chapter.slug}/`),
    ...projects.map((project) => `/projects/${project.slug}/`),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>${new URL(route, site).href}</loc></url>`).join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml" } },
  );
};
