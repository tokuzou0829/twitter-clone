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
