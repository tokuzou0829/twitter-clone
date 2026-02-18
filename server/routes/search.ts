import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { z } from "zod";

import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import { createHonoApp } from "../create-app";
import { loadPostSummaryMap } from "./shared/social";

const searchQuerySchema = z.object({
	q: z.string().trim().max(80).optional(),
});

const SEARCH_POST_LIMIT = 30;
const SEARCH_USER_LIMIT = 20;
const SEARCH_HASHTAG_SAMPLE_LIMIT = 800;
const SEARCH_HASHTAG_LIMIT = 10;
const HASHTAG_REGEX = /(?:^|\s)#([\p{L}\p{N}_]{1,50})/gu;
const QUERY_HASHTAG_REGEX = /#([\p{L}\p{N}_]{1,50})/gu;

/** Escapes \ % _ for use in SQL LIKE/ILIKE patterns (PostgreSQL default escape is backslash). */
const escapeLike = (value: string): string =>
	value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

const app = createHonoApp().get(
	"/",
	zValidator("query", searchQuerySchema),
	async (c) => {
		const { q } = c.req.valid("query");
		const query = q?.trim() ?? "";

		if (!query) {
			return c.json({
				query: "",
				posts: [],
				users: [],
				hashtags: [],
			});
		}

		const db = c.get("db");
		const viewerId = c.get("user")?.id ?? null;
		const publicUrl = c.get("r2").publicUrl;

		const [postIds, users, hashtags] = await Promise.all([
			loadPostIdsByQuery(db, query),
			loadUsersByQuery(db, query),
			loadHashtagMatches(db, query),
		]);

		const postMap = await loadPostSummaryMap({
			db,
			publicUrl,
			postIds,
			viewerId,
		});

		const posts = postIds
			.map((postId) => postMap.get(postId))
			.filter((post): post is NonNullable<typeof post> => post !== undefined);

		return c.json({
			query,
			posts,
			users,
			hashtags,
		});
	},
);

export default app;

const loadPostIdsByQuery = async (db: Database, query: string) => {
	const queryHashtags = extractQueryHashtags(query);
	const whereClause =
		queryHashtags.length >= 2
			? and(
					isNotNull(schema.posts.content),
					...queryHashtags.map((hashtag) =>
						ilike(schema.posts.content, `%#${hashtag}%`),
					),
				)
			: and(
					isNotNull(schema.posts.content),
					ilike(schema.posts.content, `%${query}%`),
				);

	const rows = await db
		.select({
			id: schema.posts.id,
		})
		.from(schema.posts)
		.where(whereClause)
		.orderBy(desc(schema.posts.createdAt))
		.limit(SEARCH_POST_LIMIT);

	return rows.map((row) => row.id);
};

const loadUsersByQuery = async (
	db: Database,
	query: string,
): Promise<
	Array<{
		id: string;
		name: string;
		handle: string | null;
		image: string | null;
		bio: string | null;
		bannerImage: string | null;
	}>
> => {
	const pattern = `%${escapeLike(query.trim())}%`;
	const rows = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			handle: schema.user.handle,
			image: schema.user.image,
			bio: schema.user.bio,
			bannerImage: schema.user.bannerImage,
		})
		.from(schema.user)
		.where(
			and(
				eq(schema.user.isBanned, false),
				or(
					ilike(schema.user.name, pattern),
					ilike(schema.user.handle, pattern),
				),
			),
		)
		.limit(SEARCH_USER_LIMIT);

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		handle: row.handle,
		image: row.image,
		bio: row.bio,
		bannerImage: row.bannerImage,
	}));
};

const loadHashtagMatches = async (
	db: Database,
	rawQuery: string,
): Promise<Array<{ tag: string; count: number }>> => {
	const queryHashtags = extractQueryHashtags(rawQuery);
	const normalizedQuery = normalizeHashtagQuery(rawQuery);

	if (!normalizedQuery && queryHashtags.length < 2) {
		return [];
	}

	const hashtagQueryWhere =
		queryHashtags.length >= 2
			? and(
					isNotNull(schema.posts.content),
					...queryHashtags.map((hashtag) =>
						ilike(schema.posts.content, `%#${hashtag}%`),
					),
				)
			: isNotNull(schema.posts.content);

	const rows = await db
		.select({
			content: schema.posts.content,
		})
		.from(schema.posts)
		.where(hashtagQueryWhere)
		.orderBy(desc(schema.posts.createdAt))
		.limit(SEARCH_HASHTAG_SAMPLE_LIMIT);

	const hashtagCounts = new Map<string, number>();

	for (const row of rows) {
		if (!row.content) {
			continue;
		}

		for (const match of row.content.matchAll(HASHTAG_REGEX)) {
			const rawTag = match[1]?.trim();
			if (!rawTag) {
				continue;
			}

			const normalizedTag = rawTag.toLowerCase();
			if (
				queryHashtags.length < 2 &&
				!normalizedTag.includes(normalizedQuery)
			) {
				continue;
			}

			const fullTag = `#${normalizedTag}`;
			hashtagCounts.set(fullTag, (hashtagCounts.get(fullTag) ?? 0) + 1);
		}
	}

	return [...hashtagCounts.entries()]
		.sort((a, b) => {
			if (b[1] !== a[1]) {
				return b[1] - a[1];
			}

			return a[0].localeCompare(b[0]);
		})
		.slice(0, SEARCH_HASHTAG_LIMIT)
		.map(([tag, count]) => ({
			tag,
			count,
		}));
};

const normalizeHashtagQuery = (value: string) => {
	const normalized = value.trim().toLowerCase();
	if (!normalized) {
		return "";
	}

	return normalized.startsWith("#") ? normalized.slice(1) : normalized;
};

const extractQueryHashtags = (value: string) => {
	const hashtags = new Set<string>();

	for (const match of value.matchAll(QUERY_HASHTAG_REGEX)) {
		const rawTag = match[1]?.trim().toLowerCase();
		if (!rawTag) {
			continue;
		}

		hashtags.add(rawTag);
	}

	return [...hashtags];
};
