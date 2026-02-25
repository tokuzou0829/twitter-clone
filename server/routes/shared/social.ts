import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";

type UserSummary = {
	id: string;
	name: string;
	handle: string | null;
	image: string | null;
	bio: string | null;
	bannerImage: string | null;
};

type PostImageSummary = {
	id: string;
	url: string;
	position: number;
};

type LinkSummary = {
	id: string;
	url: string;
	host: string;
	displayUrl: string;
	title: string | null;
	description: string | null;
	imageUrl: string | null;
	siteName: string | null;
	ogpFetchedAt: string | null;
	ogpNextRefreshAt: string | null;
};

type PostMentionSummary = {
	start: number;
	end: number;
	user: UserSummary;
};

type QuotePostSummary = {
	id: string;
	content: string | null;
	createdAt: string;
	author: UserSummary;
	images: PostImageSummary[];
	links: LinkSummary[];
	mentions: PostMentionSummary[];
};

type PostSummary = {
	id: string;
	content: string | null;
	createdAt: string;
	updatedAt: string;
	replyToPostId: string | null;
	quotePostId: string | null;
	author: UserSummary;
	images: PostImageSummary[];
	links: LinkSummary[];
	mentions: PostMentionSummary[];
	quotePost: QuotePostSummary | null;
	stats: {
		likes: number;
		reposts: number;
		replies: number;
		quotes: number;
	};
	viewer: {
		liked: boolean;
		reposted: boolean;
		followingAuthor: boolean;
	};
};

type TimelineItem = {
	id: string;
	type: "post" | "repost";
	createdAt: string;
	actor: UserSummary;
	post: PostSummary;
};

type TimelineTab = "posts" | "replies" | "media" | "likes";

type PostRow = {
	postId: string;
	content: string | null;
	createdAt: Date;
	updatedAt: Date;
	replyToPostId: string | null;
	quotePostId: string | null;
	authorId: string;
	authorName: string;
	authorHandle: string | null;
	authorImage: string | null;
	authorBio: string | null;
	authorBannerImage: string | null;
};

const MAX_TIMELINE_ITEMS = 50;

export const loadTimelineItems = async (params: {
	db: Database;
	publicUrl: string;
	viewerId: string | null;
	actorUserId?: string;
	tab?: TimelineTab;
	limit?: number;
}): Promise<TimelineItem[]> => {
	const {
		db,
		publicUrl,
		viewerId,
		actorUserId,
		tab = "posts",
		limit = MAX_TIMELINE_ITEMS,
	} = params;

	const normalizedTab: TimelineTab = actorUserId ? tab : "posts";
	let mergedEvents: Array<
		| {
				type: "post";
				eventId: string;
				postId: string;
				createdAt: Date;
		  }
		| {
				type: "repost";
				eventId: string;
				postId: string;
				createdAt: Date;
				actor: UserSummary;
		  }
	> = [];

	if (actorUserId && normalizedTab === "replies") {
		const replyEvents = await db
			.select({
				eventId: schema.posts.id,
				postId: schema.posts.id,
				createdAt: schema.posts.createdAt,
			})
			.from(schema.posts)
			.where(
				and(
					eq(schema.posts.authorId, actorUserId),
					isNotNull(schema.posts.replyToPostId),
				),
			)
			.orderBy(desc(schema.posts.createdAt))
			.limit(limit);

		mergedEvents = replyEvents.map((event) => ({
			type: "post",
			eventId: event.eventId,
			postId: event.postId,
			createdAt: event.createdAt,
		}));
	} else if (actorUserId && normalizedTab === "media") {
		const mediaRows = await db
			.select({
				postId: schema.posts.id,
				createdAt: schema.posts.createdAt,
			})
			.from(schema.postImages)
			.innerJoin(schema.posts, eq(schema.postImages.postId, schema.posts.id))
			.where(eq(schema.posts.authorId, actorUserId))
			.orderBy(desc(schema.posts.createdAt));

		const seenPostIds = new Set<string>();
		const mediaEvents: Array<{
			type: "post";
			eventId: string;
			postId: string;
			createdAt: Date;
		}> = [];

		for (const mediaRow of mediaRows) {
			if (seenPostIds.has(mediaRow.postId)) {
				continue;
			}

			seenPostIds.add(mediaRow.postId);
			mediaEvents.push({
				type: "post",
				eventId: mediaRow.postId,
				postId: mediaRow.postId,
				createdAt: mediaRow.createdAt,
			});

			if (mediaEvents.length >= limit) {
				break;
			}
		}

		mergedEvents = mediaEvents;
	} else if (actorUserId && normalizedTab === "likes") {
		const likeEvents = await db
			.select({
				eventId: schema.postLikes.id,
				postId: schema.postLikes.postId,
				createdAt: schema.postLikes.createdAt,
			})
			.from(schema.postLikes)
			.where(eq(schema.postLikes.userId, actorUserId))
			.orderBy(desc(schema.postLikes.createdAt))
			.limit(limit);

		mergedEvents = likeEvents.map((event) => ({
			type: "post",
			eventId: event.eventId,
			postId: event.postId,
			createdAt: event.createdAt,
		}));
	} else {
		const [postEvents, repostEvents] = await Promise.all([
			actorUserId
				? db
						.select({
							eventId: schema.posts.id,
							postId: schema.posts.id,
							createdAt: schema.posts.createdAt,
						})
						.from(schema.posts)
						.where(eq(schema.posts.authorId, actorUserId))
						.orderBy(desc(schema.posts.createdAt))
						.limit(limit)
				: db
						.select({
							eventId: schema.posts.id,
							postId: schema.posts.id,
							createdAt: schema.posts.createdAt,
						})
						.from(schema.posts)
						.orderBy(desc(schema.posts.createdAt))
						.limit(limit),
			actorUserId
				? db
						.select({
							eventId: schema.postReposts.id,
							postId: schema.postReposts.postId,
							createdAt: schema.postReposts.createdAt,
							actorId: schema.user.id,
							actorName: schema.user.name,
							actorHandle: schema.user.handle,
							actorImage: schema.user.image,
							actorBio: schema.user.bio,
							actorBannerImage: schema.user.bannerImage,
						})
						.from(schema.postReposts)
						.innerJoin(
							schema.user,
							eq(schema.postReposts.userId, schema.user.id),
						)
						.where(eq(schema.postReposts.userId, actorUserId))
						.orderBy(desc(schema.postReposts.createdAt))
						.limit(limit)
				: db
						.select({
							eventId: schema.postReposts.id,
							postId: schema.postReposts.postId,
							createdAt: schema.postReposts.createdAt,
							actorId: schema.user.id,
							actorName: schema.user.name,
							actorHandle: schema.user.handle,
							actorImage: schema.user.image,
							actorBio: schema.user.bio,
							actorBannerImage: schema.user.bannerImage,
						})
						.from(schema.postReposts)
						.innerJoin(
							schema.user,
							eq(schema.postReposts.userId, schema.user.id),
						)
						.orderBy(desc(schema.postReposts.createdAt))
						.limit(limit),
		]);

		mergedEvents = [
			...postEvents.map((event) => ({
				type: "post" as const,
				eventId: event.eventId,
				postId: event.postId,
				createdAt: event.createdAt,
			})),
			...repostEvents.map((event) => ({
				type: "repost" as const,
				eventId: event.eventId,
				postId: event.postId,
				createdAt: event.createdAt,
				actor: {
					id: event.actorId,
					name: event.actorName,
					handle: event.actorHandle,
					image: event.actorImage,
					bio: event.actorBio,
					bannerImage: event.actorBannerImage,
				},
			})),
		]
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.slice(0, limit);
	}

	const postIds = mergedEvents.map((event) => event.postId);
	const postMap = await loadPostSummaryMap({
		db,
		publicUrl,
		postIds,
		viewerId,
	});

	return mergedEvents
		.map((event): TimelineItem | null => {
			const post = postMap.get(event.postId);
			if (!post) {
				return null;
			}

			return {
				id: event.eventId,
				type: event.type,
				createdAt: event.createdAt.toISOString(),
				actor: event.type === "repost" ? event.actor : post.author,
				post,
			};
		})
		.filter((event): event is TimelineItem => event !== null);
};

export const loadPostSummaryMap = async (params: {
	db: Database;
	publicUrl: string;
	postIds: string[];
	viewerId: string | null;
}): Promise<Map<string, PostSummary>> => {
	const { db, publicUrl, postIds, viewerId } = params;
	const uniquePostIds = [...new Set(postIds)];

	if (uniquePostIds.length === 0) {
		return new Map<string, PostSummary>();
	}

	const postRows = await db
		.select({
			postId: schema.posts.id,
			content: schema.posts.content,
			createdAt: schema.posts.createdAt,
			updatedAt: schema.posts.updatedAt,
			replyToPostId: schema.posts.replyToPostId,
			quotePostId: schema.posts.quotePostId,
			authorId: schema.user.id,
			authorName: schema.user.name,
			authorHandle: schema.user.handle,
			authorImage: schema.user.image,
			authorBio: schema.user.bio,
			authorBannerImage: schema.user.bannerImage,
		})
		.from(schema.posts)
		.innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
		.where(inArray(schema.posts.id, uniquePostIds));

	if (postRows.length === 0) {
		return new Map<string, PostSummary>();
	}

	const [
		imagesByPostId,
		linksByPostId,
		mentionsByPostId,
		quoteMap,
		counts,
		viewerState,
	] = await Promise.all([
		loadImagesByPostId(db, publicUrl, uniquePostIds),
		loadLinksByPostId(db, uniquePostIds),
		loadMentionsByPostId(db, uniquePostIds),
		loadQuotePostMap(db, publicUrl, postRows),
		loadCounts(db, uniquePostIds),
		loadViewerState(db, viewerId, uniquePostIds, postRows),
	]);

	const postMap = new Map<string, PostSummary>();

	for (const postRow of postRows) {
		const author = toUserSummary(postRow);
		postMap.set(postRow.postId, {
			id: postRow.postId,
			content: postRow.content,
			createdAt: postRow.createdAt.toISOString(),
			updatedAt: postRow.updatedAt.toISOString(),
			replyToPostId: postRow.replyToPostId,
			quotePostId: postRow.quotePostId,
			author,
			images: imagesByPostId.get(postRow.postId) ?? [],
			links: linksByPostId.get(postRow.postId) ?? [],
			mentions: mentionsByPostId.get(postRow.postId) ?? [],
			quotePost: postRow.quotePostId
				? (quoteMap.get(postRow.quotePostId) ?? null)
				: null,
			stats: {
				likes: counts.likes.get(postRow.postId) ?? 0,
				reposts: counts.reposts.get(postRow.postId) ?? 0,
				replies: counts.replies.get(postRow.postId) ?? 0,
				quotes: counts.quotes.get(postRow.postId) ?? 0,
			},
			viewer: {
				liked: viewerState.likedPostIds.has(postRow.postId),
				reposted: viewerState.repostedPostIds.has(postRow.postId),
				followingAuthor: viewerState.followingAuthorIds.has(postRow.authorId),
			},
		});
	}

	return postMap;
};

const loadQuotePostMap = async (
	db: Database,
	publicUrl: string,
	postRows: PostRow[],
) => {
	const quotePostIds = [
		...new Set(
			postRows
				.map((postRow) => postRow.quotePostId)
				.filter((quotePostId): quotePostId is string => Boolean(quotePostId)),
		),
	];

	if (quotePostIds.length === 0) {
		return new Map<string, QuotePostSummary>();
	}

	const [
		quoteRows,
		quoteImagesByPostId,
		quoteLinksByPostId,
		quoteMentionsByPostId,
	] = await Promise.all([
		db
			.select({
				postId: schema.posts.id,
				content: schema.posts.content,
				createdAt: schema.posts.createdAt,
				authorId: schema.user.id,
				authorName: schema.user.name,
				authorHandle: schema.user.handle,
				authorImage: schema.user.image,
				authorBio: schema.user.bio,
				authorBannerImage: schema.user.bannerImage,
			})
			.from(schema.posts)
			.innerJoin(schema.user, eq(schema.posts.authorId, schema.user.id))
			.where(inArray(schema.posts.id, quotePostIds)),
		loadImagesByPostId(db, publicUrl, quotePostIds),
		loadLinksByPostId(db, quotePostIds),
		loadMentionsByPostId(db, quotePostIds),
	]);

	const quoteMap = new Map<string, QuotePostSummary>();
	for (const quoteRow of quoteRows) {
		quoteMap.set(quoteRow.postId, {
			id: quoteRow.postId,
			content: quoteRow.content,
			createdAt: quoteRow.createdAt.toISOString(),
			author: toUserSummary(quoteRow),
			images: quoteImagesByPostId.get(quoteRow.postId) ?? [],
			links: quoteLinksByPostId.get(quoteRow.postId) ?? [],
			mentions: quoteMentionsByPostId.get(quoteRow.postId) ?? [],
		});
	}

	return quoteMap;
};

const loadImagesByPostId = async (
	db: Database,
	publicUrl: string,
	postIds: string[],
) => {
	if (postIds.length === 0) {
		return new Map<string, PostImageSummary[]>();
	}

	const imageRows = await db
		.select({
			postId: schema.postImages.postId,
			fileId: schema.postImages.fileId,
			position: schema.postImages.position,
			key: schema.files.key,
		})
		.from(schema.postImages)
		.innerJoin(schema.files, eq(schema.postImages.fileId, schema.files.id))
		.where(inArray(schema.postImages.postId, postIds))
		.orderBy(asc(schema.postImages.position));

	const imagesByPostId = new Map<string, PostImageSummary[]>();
	for (const imageRow of imageRows) {
		const list = imagesByPostId.get(imageRow.postId) ?? [];
		list.push({
			id: imageRow.fileId,
			url: createPublicFileUrl(publicUrl, imageRow.key),
			position: imageRow.position,
		});
		imagesByPostId.set(imageRow.postId, list);
	}

	return imagesByPostId;
};

const loadLinksByPostId = async (db: Database, postIds: string[]) => {
	if (postIds.length === 0) {
		return new Map<string, LinkSummary[]>();
	}

	const linkRows = await db
		.select({
			postId: schema.postLinks.postId,
			position: schema.postLinks.position,
			linkId: schema.links.id,
			normalizedUrl: schema.links.normalizedUrl,
			host: schema.links.host,
			displayUrl: schema.links.displayUrl,
			title: schema.links.title,
			description: schema.links.description,
			imageUrl: schema.links.imageUrl,
			siteName: schema.links.siteName,
			ogpFetchedAt: schema.links.ogpFetchedAt,
			ogpNextRefreshAt: schema.links.ogpNextRefreshAt,
		})
		.from(schema.postLinks)
		.innerJoin(schema.links, eq(schema.postLinks.linkId, schema.links.id))
		.where(inArray(schema.postLinks.postId, postIds))
		.orderBy(asc(schema.postLinks.position));

	const linksByPostId = new Map<string, LinkSummary[]>();
	for (const linkRow of linkRows) {
		const list = linksByPostId.get(linkRow.postId) ?? [];
		list.push({
			id: linkRow.linkId,
			url: linkRow.normalizedUrl,
			host: linkRow.host,
			displayUrl: linkRow.displayUrl,
			title: linkRow.title,
			description: linkRow.description,
			imageUrl: linkRow.imageUrl,
			siteName: linkRow.siteName,
			ogpFetchedAt: linkRow.ogpFetchedAt?.toISOString() ?? null,
			ogpNextRefreshAt: linkRow.ogpNextRefreshAt?.toISOString() ?? null,
		});
		linksByPostId.set(linkRow.postId, list);
	}

	return linksByPostId;
};

const loadMentionsByPostId = async (db: Database, postIds: string[]) => {
	if (postIds.length === 0) {
		return new Map<string, PostMentionSummary[]>();
	}

	const mentionRows = await db
		.select({
			postId: schema.postMentions.postId,
			start: schema.postMentions.start,
			end: schema.postMentions.end,
			position: schema.postMentions.position,
			userId: schema.user.id,
			userName: schema.user.name,
			userHandle: schema.user.handle,
			userImage: schema.user.image,
			userBio: schema.user.bio,
			userBannerImage: schema.user.bannerImage,
		})
		.from(schema.postMentions)
		.innerJoin(
			schema.user,
			eq(schema.postMentions.mentionedUserId, schema.user.id),
		)
		.where(inArray(schema.postMentions.postId, postIds))
		.orderBy(
			asc(schema.postMentions.postId),
			asc(schema.postMentions.position),
		);

	const mentionsByPostId = new Map<string, PostMentionSummary[]>();
	for (const mentionRow of mentionRows) {
		const list = mentionsByPostId.get(mentionRow.postId) ?? [];
		list.push({
			start: mentionRow.start,
			end: mentionRow.end,
			user: {
				id: mentionRow.userId,
				name: mentionRow.userName,
				handle: mentionRow.userHandle,
				image: mentionRow.userImage,
				bio: mentionRow.userBio,
				bannerImage: mentionRow.userBannerImage,
			},
		});
		mentionsByPostId.set(mentionRow.postId, list);
	}

	return mentionsByPostId;
};

const loadCounts = async (db: Database, postIds: string[]) => {
	const [likeRows, repostRows, replyRows, quoteRows] = await Promise.all([
		db
			.select({
				postId: schema.postLikes.postId,
				count: count(),
			})
			.from(schema.postLikes)
			.where(inArray(schema.postLikes.postId, postIds))
			.groupBy(schema.postLikes.postId),
		db
			.select({
				postId: schema.postReposts.postId,
				count: count(),
			})
			.from(schema.postReposts)
			.where(inArray(schema.postReposts.postId, postIds))
			.groupBy(schema.postReposts.postId),
		db
			.select({
				postId: schema.posts.replyToPostId,
				count: count(),
			})
			.from(schema.posts)
			.where(
				and(
					isNotNull(schema.posts.replyToPostId),
					inArray(schema.posts.replyToPostId, postIds),
				),
			)
			.groupBy(schema.posts.replyToPostId),
		db
			.select({
				postId: schema.posts.quotePostId,
				count: count(),
			})
			.from(schema.posts)
			.where(
				and(
					isNotNull(schema.posts.quotePostId),
					inArray(schema.posts.quotePostId, postIds),
				),
			)
			.groupBy(schema.posts.quotePostId),
	]);

	const likes = new Map<string, number>();
	for (const row of likeRows) {
		likes.set(row.postId, Number(row.count));
	}

	const reposts = new Map<string, number>();
	for (const row of repostRows) {
		reposts.set(row.postId, Number(row.count));
	}

	const replies = new Map<string, number>();
	for (const row of replyRows) {
		if (!row.postId) {
			continue;
		}
		replies.set(row.postId, Number(row.count));
	}

	const quotes = new Map<string, number>();
	for (const row of quoteRows) {
		if (!row.postId) {
			continue;
		}
		quotes.set(row.postId, Number(row.count));
	}

	return {
		likes,
		reposts,
		replies,
		quotes,
	};
};

const loadViewerState = async (
	db: Database,
	viewerId: string | null,
	postIds: string[],
	postRows: PostRow[],
) => {
	if (!viewerId) {
		return {
			likedPostIds: new Set<string>(),
			repostedPostIds: new Set<string>(),
			followingAuthorIds: new Set<string>(),
		};
	}

	const authorIds = [...new Set(postRows.map((postRow) => postRow.authorId))];

	const [likedRows, repostedRows, followingRows] = await Promise.all([
		db
			.select({ postId: schema.postLikes.postId })
			.from(schema.postLikes)
			.where(
				and(
					eq(schema.postLikes.userId, viewerId),
					inArray(schema.postLikes.postId, postIds),
				),
			),
		db
			.select({ postId: schema.postReposts.postId })
			.from(schema.postReposts)
			.where(
				and(
					eq(schema.postReposts.userId, viewerId),
					inArray(schema.postReposts.postId, postIds),
				),
			),
		authorIds.length === 0
			? Promise.resolve([])
			: db
					.select({ followingId: schema.follows.followingId })
					.from(schema.follows)
					.where(
						and(
							eq(schema.follows.followerId, viewerId),
							inArray(schema.follows.followingId, authorIds),
						),
					),
	]);

	return {
		likedPostIds: new Set(likedRows.map((row) => row.postId)),
		repostedPostIds: new Set(repostedRows.map((row) => row.postId)),
		followingAuthorIds: new Set(followingRows.map((row) => row.followingId)),
	};
};

const toUserSummary = (row: {
	authorId: string;
	authorName: string;
	authorHandle: string | null;
	authorImage: string | null;
	authorBio: string | null;
	authorBannerImage: string | null;
}): UserSummary => {
	return {
		id: row.authorId,
		name: row.authorName,
		handle: row.authorHandle,
		image: row.authorImage,
		bio: row.authorBio,
		bannerImage: row.authorBannerImage,
	};
};

const createPublicFileUrl = (baseUrl: string, key: string) => {
	const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
	return new URL(key, normalizedBaseUrl).toString();
};
