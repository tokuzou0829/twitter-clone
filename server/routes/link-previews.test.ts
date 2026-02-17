import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./link-previews";

const { db } = await setup();

afterEach(() => {
	vi.restoreAllMocks();
});

describe("/routes/link-previews", () => {
	it("1回のリクエストで更新するリンクは最大1件", async () => {
		await db.insert(schema.links).values([
			{
				id: "link_preview_link_a",
				normalizedUrl: "https://example.com/a",
				host: "example.com",
				displayUrl: "example.com/a",
			},
			{
				id: "link_preview_link_b",
				normalizedUrl: "https://example.com/b",
				host: "example.com",
				displayUrl: "example.com/b",
			},
		]);

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				`<html><head>
					<meta property="og:title" content="Example title" />
					<meta property="og:description" content="Example description" />
					<meta property="og:image" content="https://cdn.example.com/card.png" />
					<meta property="og:site_name" content="Example Site" />
				</head></html>`,
				{
					status: 200,
					headers: {
						"content-type": "text/html; charset=utf-8",
					},
				},
			),
		);

		const response = await app.request("/refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				linkIds: ["link_preview_link_a", "link_preview_link_b"],
			}),
		});
		const body = (await response.json()) as {
			updated: { id: string; title: string | null } | null;
		};

		const [linkA] = await db
			.select({
				title: schema.links.title,
			})
			.from(schema.links)
			.where(eq(schema.links.id, "link_preview_link_a"))
			.limit(1);
		const [linkB] = await db
			.select({
				title: schema.links.title,
			})
			.from(schema.links)
			.where(eq(schema.links.id, "link_preview_link_b"))
			.limit(1);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(body.updated?.id).toBe("link_preview_link_a");
		expect(linkA?.title).toBe("Example title");
		expect(linkB?.title).toBeNull();
	});

	it("先頭200KBを超える位置にあるOGPメタ情報も取得する", async () => {
		await db.insert(schema.links).values({
			id: "link_preview_late_ogp",
			normalizedUrl: "https://example.com/late-ogp",
			host: "example.com",
			displayUrl: "example.com/late-ogp",
		});

		const largeHeadPadding = " ".repeat(210_000);
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				`<html><head>
					<meta charset="utf-8" />
					${largeHeadPadding}
					<meta property="og:title" content="Late OGP title" />
					<meta property="og:description" content="Late OGP description" />
					<meta property="og:image" content="https://cdn.example.com/late-card.png" />
					<meta property="og:site_name" content="Late Example Site" />
				</head></html>`,
				{
					status: 200,
					headers: {
						"content-type": "text/html; charset=utf-8",
					},
				},
			),
		);

		const response = await app.request("/refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				linkIds: ["link_preview_late_ogp"],
			}),
		});
		const body = (await response.json()) as {
			updated: { id: string; title: string | null } | null;
		};

		const [link] = await db
			.select({
				title: schema.links.title,
				description: schema.links.description,
				imageUrl: schema.links.imageUrl,
				siteName: schema.links.siteName,
			})
			.from(schema.links)
			.where(eq(schema.links.id, "link_preview_late_ogp"))
			.limit(1);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(body.updated?.id).toBe("link_preview_late_ogp");
		expect(link?.title).toBe("Late OGP title");
		expect(link?.description).toBe("Late OGP description");
		expect(link?.imageUrl).toBe("https://cdn.example.com/late-card.png");
		expect(link?.siteName).toBe("Late Example Site");
	});

	it("YouTubeリンクはoEmbedを優先して取得する", async () => {
		await db.insert(schema.links).values({
			id: "link_preview_youtube_oembed",
			normalizedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			host: "www.youtube.com",
			displayUrl: "youtube.com/watch?v=dQw4w9WgXcQ",
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input) => {
				const requestUrl = toFetchRequestUrl(input);
				if (requestUrl.startsWith("https://www.youtube.com/oembed?")) {
					return new Response(
						JSON.stringify({
							title: "YouTube oEmbed title",
							thumbnail_url: "https://i.ytimg.com/vi/example/hqdefault.jpg",
							provider_name: "YouTube",
						}),
						{
							status: 200,
							headers: {
								"content-type": "application/json; charset=utf-8",
							},
						},
					);
				}

				throw new Error(`Unexpected request URL: ${requestUrl}`);
			});

		const response = await app.request("/refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				linkIds: ["link_preview_youtube_oembed"],
			}),
		});
		const body = (await response.json()) as {
			updated: { id: string } | null;
		};

		const [link] = await db
			.select({
				title: schema.links.title,
				description: schema.links.description,
				imageUrl: schema.links.imageUrl,
				siteName: schema.links.siteName,
			})
			.from(schema.links)
			.where(eq(schema.links.id, "link_preview_youtube_oembed"))
			.limit(1);

		expect(response.status).toBe(200);
		expect(body.updated?.id).toBe("link_preview_youtube_oembed");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(link?.title).toBe("YouTube oEmbed title");
		expect(link?.description).toBeNull();
		expect(link?.imageUrl).toBe("https://i.ytimg.com/vi/example/hqdefault.jpg");
		expect(link?.siteName).toBe("YouTube");

		const firstCall = fetchSpy.mock.calls[0];
		expect(firstCall).toBeDefined();
		const firstCallUrl = toFetchRequestUrl(firstCall?.[0] ?? "");
		expect(firstCallUrl).toContain("https://www.youtube.com/oembed?");
		expect(firstCallUrl).toContain(
			`url=${encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ")}`,
		);
		expect(firstCallUrl).toContain("format=json");
	});

	it("YouTube oEmbedの取得に失敗したらOGP取得へフォールバックする", async () => {
		await db.insert(schema.links).values({
			id: "link_preview_youtube_oembed_fallback",
			normalizedUrl: "https://www.youtube.com/watch?v=5qap5aO4i9A",
			host: "www.youtube.com",
			displayUrl: "youtube.com/watch?v=5qap5aO4i9A",
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input) => {
				const requestUrl = toFetchRequestUrl(input);
				if (requestUrl.startsWith("https://www.youtube.com/oembed?")) {
					return new Response("Bad Request", {
						status: 400,
						headers: {
							"content-type": "text/plain; charset=utf-8",
						},
					});
				}

				if (requestUrl === "https://www.youtube.com/watch?v=5qap5aO4i9A") {
					return new Response(
						`<html><head>
							<meta property="og:title" content="YouTube OGP fallback title" />
							<meta property="og:description" content="YouTube OGP fallback description" />
							<meta property="og:image" content="https://i.ytimg.com/vi/fallback/maxresdefault.jpg" />
							<meta property="og:site_name" content="YouTube" />
						</head></html>`,
						{
							status: 200,
							headers: {
								"content-type": "text/html; charset=utf-8",
							},
						},
					);
				}

				throw new Error(`Unexpected request URL: ${requestUrl}`);
			});

		const response = await app.request("/refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				linkIds: ["link_preview_youtube_oembed_fallback"],
			}),
		});
		const body = (await response.json()) as {
			updated: { id: string } | null;
		};

		const [link] = await db
			.select({
				title: schema.links.title,
				description: schema.links.description,
				imageUrl: schema.links.imageUrl,
				siteName: schema.links.siteName,
			})
			.from(schema.links)
			.where(eq(schema.links.id, "link_preview_youtube_oembed_fallback"))
			.limit(1);

		expect(response.status).toBe(200);
		expect(body.updated?.id).toBe("link_preview_youtube_oembed_fallback");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(link?.title).toBe("YouTube OGP fallback title");
		expect(link?.description).toBe("YouTube OGP fallback description");
		expect(link?.imageUrl).toBe(
			"https://i.ytimg.com/vi/fallback/maxresdefault.jpg",
		);
		expect(link?.siteName).toBe("YouTube");

		const firstCall = fetchSpy.mock.calls[0];
		const secondCall = fetchSpy.mock.calls[1];
		expect(toFetchRequestUrl(firstCall?.[0] ?? "")).toContain(
			"https://www.youtube.com/oembed?",
		);
		expect(toFetchRequestUrl(secondCall?.[0] ?? "")).toBe(
			"https://www.youtube.com/watch?v=5qap5aO4i9A",
		);
	});

	it("次回更新期限内のリンクは更新しない", async () => {
		await db.insert(schema.links).values({
			id: "link_preview_fresh",
			normalizedUrl: "https://example.com/fresh",
			host: "example.com",
			displayUrl: "example.com/fresh",
			ogpNextRefreshAt: new Date(Date.now() + 30 * 60 * 1000),
		});

		const fetchSpy = vi.spyOn(globalThis, "fetch");

		const response = await app.request("/refresh", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				linkIds: ["link_preview_fresh"],
			}),
		});
		const body = (await response.json()) as {
			updated: { id: string } | null;
		};

		expect(response.status).toBe(200);
		expect(body.updated).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

const toFetchRequestUrl = (input: Parameters<typeof fetch>[0]) => {
	if (typeof input === "string") {
		return input;
	}

	if (input instanceof URL) {
		return input.toString();
	}

	return input.url;
};
