import { and, desc, eq, gte, isNotNull } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import { createHonoApp } from "../create-app";

const TREND_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const TREND_SAMPLE_BATCH_SIZE = 500;
const TREND_MAX_SCAN_ROWS = 20000;
const TREND_LIMIT = 8;
const TREND_MAX_CONTRIBUTION_PER_AUTHOR = 5;
const TREND_MIN_UNIQUE_AUTHORS = 2;
const SUGGESTION_LIMIT = 4;
const SUGGESTION_SAMPLE_LIMIT = 100;
const HASHTAG_REGEX = /(?:^|\s)#([\p{L}\p{N}_]{1,50})/gu;

type TrendItem = {
	tag: string;
	count: number;
};

type TrendAccumulator = {
	total: number;
	authorCounts: Map<string, number>;
};

type SuggestedUser = {
	id: string;
	name: string;
	handle: string | null;
	image: string | null;
	bio: string | null;
	bannerImage: string | null;
};

const app = createHonoApp().get("/", async (c) => {
	const viewer = c.get("user");
	const db = c.get("db");

	const [trends, suggestedUsers] = await Promise.all([
		loadTrendsFromRecentPosts(db),
		loadSuggestedUsers(db, viewer?.id ?? null),
	]);

	return c.json({
		trends,
		suggestedUsers,
	});
});

export default app;

const loadTrendsFromRecentPosts = async (
	db: Database,
): Promise<TrendItem[]> => {
	const since = new Date(Date.now() - TREND_LOOKBACK_MS);
	const hashtagCounts = new Map<string, TrendAccumulator>();

	for (
		let offset = 0;
		offset < TREND_MAX_SCAN_ROWS;
		offset += TREND_SAMPLE_BATCH_SIZE
	) {
		const postRows = await db
			.select({
				content: schema.posts.content,
				authorId: schema.posts.authorId,
			})
			.from(schema.posts)
			.where(
				and(
					isNotNull(schema.posts.content),
					gte(schema.posts.createdAt, since),
				),
			)
			.orderBy(desc(schema.posts.createdAt), desc(schema.posts.id))
			.limit(TREND_SAMPLE_BATCH_SIZE)
			.offset(offset);

		for (const postRow of postRows) {
			if (!postRow.content) {
				continue;
			}

			const tagsInPost = new Set<string>();
			for (const match of postRow.content.matchAll(HASHTAG_REGEX)) {
				const rawTag = match[1]?.trim();
				if (!rawTag) {
					continue;
				}
				tagsInPost.add(`#${rawTag.toLowerCase()}`);
			}

			for (const normalizedTag of tagsInPost) {
				const current = hashtagCounts.get(normalizedTag) ?? {
					total: 0,
					authorCounts: new Map<string, number>(),
				};
				const prevByAuthor = current.authorCounts.get(postRow.authorId) ?? 0;
				if (prevByAuthor >= TREND_MAX_CONTRIBUTION_PER_AUTHOR) {
					hashtagCounts.set(normalizedTag, current);
					continue;
				}

				current.total += 1;
				current.authorCounts.set(postRow.authorId, prevByAuthor + 1);
				hashtagCounts.set(normalizedTag, current);
			}
		}

		if (postRows.length < TREND_SAMPLE_BATCH_SIZE) {
			break;
		}
	}

	return [...hashtagCounts.entries()]
		.filter(([, value]) => value.authorCounts.size >= TREND_MIN_UNIQUE_AUTHORS)
		.sort((a, b) => {
			if (b[1].total !== a[1].total) {
				return b[1].total - a[1].total;
			}

			if (b[1].authorCounts.size !== a[1].authorCounts.size) {
				return b[1].authorCounts.size - a[1].authorCounts.size;
			}

			return a[0].localeCompare(b[0]);
		})
		.slice(0, TREND_LIMIT)
		.map(([tag, value]) => ({
			tag,
			count: value.total,
		}));
};

const loadSuggestedUsers = async (
	db: Database,
	viewerId: string | null,
): Promise<SuggestedUser[]> => {
	const excludeUserIds = new Set<string>();

	if (viewerId) {
		excludeUserIds.add(viewerId);

		const followingRows = await db
			.select({
				followingId: schema.follows.followingId,
			})
			.from(schema.follows)
			.where(eq(schema.follows.followerId, viewerId));

		for (const followingRow of followingRows) {
			excludeUserIds.add(followingRow.followingId);
		}
	}

	const userRows = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			handle: schema.user.handle,
			image: schema.user.image,
			bio: schema.user.bio,
			bannerImage: schema.user.bannerImage,
		})
		.from(schema.user)
		.orderBy(desc(schema.user.createdAt))
		.limit(SUGGESTION_SAMPLE_LIMIT);

	const candidates = userRows.filter(
		(userRow) => !excludeUserIds.has(userRow.id),
	);
	shuffleArray(candidates);

	return candidates.slice(0, SUGGESTION_LIMIT).map((candidate) => ({
		id: candidate.id,
		name: candidate.name,
		handle: candidate.handle,
		image: candidate.image,
		bio: candidate.bio,
		bannerImage: candidate.bannerImage,
	}));
};

const shuffleArray = <T>(values: T[]) => {
	for (let index = values.length - 1; index > 0; index -= 1) {
		const randomIndex = Math.floor(Math.random() * (index + 1));
		const current = values[index];
		values[index] = values[randomIndex];
		values[randomIndex] = current;
	}
};
