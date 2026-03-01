import { and, eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { toAbsoluteSiteUrl } from "@/lib/site-url";
import type {
	PostDetailResponse,
	ProfileResponse,
	SearchResponse,
	TimelineItem,
} from "@/lib/social-api";
import { parseUserHandle } from "@/lib/user-handle";

const EMBED_FETCH_REVALIDATE_SECONDS = 60;

type PostDetailResponseBody = PostDetailResponse & {
	error?: string;
};

type ProfileResponseBody = ProfileResponse & {
	error?: string;
};

type TimelineResponseBody = {
	items?: TimelineItem[];
	error?: string;
};

type SearchResponseBody = SearchResponse & {
	error?: string;
};

export const fetchEmbedPostDetail = async (postId: string) => {
	const response = await fetch(
		toAbsoluteSiteUrl(`/api/posts/${encodeURIComponent(postId)}`),
		{
			next: {
				revalidate: EMBED_FETCH_REVALIDATE_SECONDS,
			},
		},
	).catch(() => null);

	if (!response || !response.ok) {
		return null;
	}

	const body = (await response
		.json()
		.catch(() => null)) as PostDetailResponseBody | null;
	if (!body?.post) {
		return null;
	}

	return {
		post: body.post,
		conversationPath: body.conversationPath ?? [],
		replies: body.replies ?? [],
	};
};

export const fetchEmbedProfile = async (userId: string) => {
	const response = await fetch(
		toAbsoluteSiteUrl(`/api/users/${encodeURIComponent(userId)}`),
		{
			next: {
				revalidate: EMBED_FETCH_REVALIDATE_SECONDS,
			},
		},
	).catch(() => null);

	if (!response || !response.ok) {
		return null;
	}

	const body = (await response
		.json()
		.catch(() => null)) as ProfileResponseBody | null;
	if (!body?.user) {
		return null;
	}

	return body;
};

export const fetchEmbedUserTimeline = async (userId: string) => {
	const query = new URLSearchParams({
		userId,
		tab: "posts",
	});

	const response = await fetch(
		toAbsoluteSiteUrl(`/api/posts?${query.toString()}`),
		{
			next: {
				revalidate: EMBED_FETCH_REVALIDATE_SECONDS,
			},
		},
	).catch(() => null);

	if (!response || !response.ok) {
		return [];
	}

	const body = (await response
		.json()
		.catch(() => null)) as TimelineResponseBody | null;
	return body?.items ?? [];
};

export const fetchEmbedSearchResult = async (query: string) => {
	const normalizedQuery = query.trim();
	if (!normalizedQuery) {
		return {
			query: "",
			posts: [],
			users: [],
			hashtags: [],
		} satisfies SearchResponse;
	}

	const encodedQuery = encodeURIComponent(normalizedQuery);
	const response = await fetch(
		toAbsoluteSiteUrl(`/api/search?q=${encodedQuery}`),
		{
			next: {
				revalidate: EMBED_FETCH_REVALIDATE_SECONDS,
			},
		},
	).catch(() => null);

	if (!response || !response.ok) {
		return null;
	}

	const body = (await response
		.json()
		.catch(() => null)) as SearchResponseBody | null;
	if (!body) {
		return null;
	}

	return {
		query: body.query ?? normalizedQuery,
		posts: body.posts ?? [],
		users: body.users ?? [],
		hashtags: body.hashtags ?? [],
	};
};

export const resolveEmbedUserId = async (identifier: string) => {
	const normalizedIdentifier = identifier.trim();
	if (!normalizedIdentifier) {
		return null;
	}

	const normalizedHandle = parseUserHandle(normalizedIdentifier);
	if (normalizedHandle) {
		const [userByHandle] = await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(
				and(
					eq(schema.user.handle, normalizedHandle),
					eq(schema.user.isBanned, false),
				),
			)
			.limit(1);

		if (userByHandle) {
			return userByHandle.id;
		}
	}

	const [userById] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(
			and(
				eq(schema.user.id, normalizedIdentifier),
				eq(schema.user.isBanned, false),
			),
		)
		.limit(1);

	return userById?.id ?? null;
};
