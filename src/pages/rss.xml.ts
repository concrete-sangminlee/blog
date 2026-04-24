import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getAllPosts } from "@/utils/posts";
import { SITE } from "@/data/site.config";

export async function GET(context: APIContext) {
  const posts = await getAllPosts();
  const feedUrl = new URL(`${SITE.base}/rss.xml`, context.site!).toString();

  return rss({
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    title: SITE.title,
    description: SITE.description,
    site: new URL(SITE.base + "/", context.site!).toString(),
    // language helps feed readers route Korean content correctly;
    // atom:self lets validators verify the feed's canonical URL.
    customData: [
      `<language>${SITE.lang}</language>`,
      `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />`,
    ].join(""),
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `${SITE.base}/${post.slug}/`,
      categories: [...post.data.tags],
    })),
  });
}
