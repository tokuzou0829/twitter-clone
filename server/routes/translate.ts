import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";

import * as schema from "@/db/schema";
import { createHonoApp } from "../create-app";

const ENGLISH_CHAR_PATTERN =
	/^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}\p{Symbol}]+$/u;

const translateRequestSchema = z.object({
	postId: z.string().trim().min(1).max(128),
	target: z.string().trim().min(2).max(8).default("ja"),
	from: z.string().trim().min(2).max(8).optional(),
});

const app = createHonoApp().post(
	"/",
	zValidator("json", translateRequestSchema),
	async (c) => {
		const { postId, target, from } = c.req.valid("json");
		const db = c.get("db");

		const post = await db.query.posts.findFirst({
			where: eq(schema.posts.id, postId),
			columns: {
				id: true,
				content: true,
			},
		});

		const content = post?.content?.trim();
		if (!post || !content) {
			return c.json({ error: "Post not found or empty" }, 404);
		}

		const query = new URLSearchParams({
			content,
			target,
		});

		if (from) {
			query.set("from", from);
		} else if (ENGLISH_CHAR_PATTERN.test(content)) {
			query.set("from", "en");
		}

		const response = await fetch(
			`https://translate.evex.land/?${query.toString()}`,
			{
				headers: {
					Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
				},
			},
		);

		if (!response.ok) {
			return c.json({ error: "Failed to translate" }, 502);
		}

		const raw = await response.text();

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return c.json({ error: "Unexpected translate response" }, 502);
		}

		const first = Array.isArray(parsed) ? parsed[0] : parsed;
		if (!first || typeof first !== "object") {
			return c.json({ error: "Unexpected translate response" }, 502);
		}

		const translated = (first as { translated?: unknown }).translated;
		const detectedFrom = (first as { from?: unknown }).from;

		if (typeof translated !== "string" || !translated.trim()) {
			return c.json({ error: "Unexpected translate response" }, 502);
		}

		return c.json({
			translated,
			from: typeof detectedFrom === "string" ? detectedFrom : (from ?? null),
			target,
		});
	},
);

export default app;
