import { and, count, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { uuidv7 } from "uuidv7";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import { dispatchNotificationWebhooksForRecipient } from "./notification-webhooks";

export const assertPostExists = async (db: Database, postId: string) => {
	const [post] = await db
		.select({
			id: schema.posts.id,
			authorId: schema.posts.authorId,
		})
		.from(schema.posts)
		.where(eq(schema.posts.id, postId))
		.limit(1);

	if (!post) {
		throw new HTTPException(404, { message: "Post not found" });
	}

	return post;
};

export const createNotificationIfNeeded = async (
	db: Database,
	publicUrl: string,
	params: {
		recipientUserId: string;
		actorUserId: string;
		type: "like" | "repost" | "quote" | "reply";
		postId: string;
		quotePostId?: string;
		sourceType: string;
		sourceId: string;
		actionUrl: string;
	},
) => {
	const {
		recipientUserId,
		actorUserId,
		type,
		postId,
		quotePostId,
		sourceType,
		sourceId,
		actionUrl,
	} = params;

	if (recipientUserId === actorUserId) {
		return;
	}

	const [savedNotification] = await db
		.insert(schema.notifications)
		.values({
			id: uuidv7(),
			recipientUserId,
			actorUserId,
			type,
			postId,
			quotePostId: quotePostId ?? null,
			sourceType,
			sourceId,
			actionUrl,
			createdAt: new Date(),
		})
		.onConflictDoNothing({
			target: [schema.notifications.sourceType, schema.notifications.sourceId],
		})
		.returning({
			id: schema.notifications.id,
		});

	if (!savedNotification) {
		return;
	}

	await dispatchNotificationWebhooksForRecipient({
		db,
		publicUrl,
		recipientUserId,
		trigger: {
			notificationId: savedNotification.id,
			type,
			sourceType,
			sourceId,
		},
	}).catch(() => undefined);
};

export const removeNotificationsBySource = async (
	db: Database,
	sourceType: string,
	sourceIds: string[],
) => {
	if (sourceIds.length === 0) {
		return;
	}

	await db
		.delete(schema.notifications)
		.where(
			and(
				eq(schema.notifications.sourceType, sourceType),
				inArray(schema.notifications.sourceId, sourceIds),
			),
		);
};

export const getPostInteractionSummary = async (
	db: Database,
	postId: string,
	viewerId: string,
) => {
	const [likesCountRows, repostsCountRows, likedRows, repostedRows] =
		await Promise.all([
			db
				.select({ count: count() })
				.from(schema.postLikes)
				.where(eq(schema.postLikes.postId, postId)),
			db
				.select({ count: count() })
				.from(schema.postReposts)
				.where(eq(schema.postReposts.postId, postId)),
			db
				.select({ postId: schema.postLikes.postId })
				.from(schema.postLikes)
				.where(
					and(
						eq(schema.postLikes.postId, postId),
						eq(schema.postLikes.userId, viewerId),
					),
				)
				.limit(1),
			db
				.select({ postId: schema.postReposts.postId })
				.from(schema.postReposts)
				.where(
					and(
						eq(schema.postReposts.postId, postId),
						eq(schema.postReposts.userId, viewerId),
					),
				)
				.limit(1),
		]);

	return {
		postId,
		liked: likedRows.length > 0,
		reposted: repostedRows.length > 0,
		likes: Number(likesCountRows[0]?.count ?? 0),
		reposts: Number(repostsCountRows[0]?.count ?? 0),
	};
};

export const createPostLike = async (params: {
	db: Database;
	publicUrl: string;
	postId: string;
	userId: string;
}) => {
	const { db, publicUrl, postId, userId } = params;
	const targetPost = await assertPostExists(db, postId);

	const [savedLike] = await db
		.insert(schema.postLikes)
		.values({
			id: uuidv7(),
			postId,
			userId,
		})
		.onConflictDoNothing({
			target: [schema.postLikes.postId, schema.postLikes.userId],
		})
		.returning({
			id: schema.postLikes.id,
		});

	if (savedLike) {
		await createNotificationIfNeeded(db, publicUrl, {
			recipientUserId: targetPost.authorId,
			actorUserId: userId,
			type: "like",
			postId,
			sourceType: "post_like",
			sourceId: savedLike.id,
			actionUrl: `/posts/${postId}`,
		});
	}

	return getPostInteractionSummary(db, postId, userId);
};

export const deletePostLike = async (params: {
	db: Database;
	postId: string;
	userId: string;
}) => {
	const { db, postId, userId } = params;

	const deletedLikes = await db
		.delete(schema.postLikes)
		.where(
			and(
				eq(schema.postLikes.postId, postId),
				eq(schema.postLikes.userId, userId),
			),
		)
		.returning({
			id: schema.postLikes.id,
		});

	await removeNotificationsBySource(
		db,
		"post_like",
		deletedLikes.map((like) => like.id),
	);

	return getPostInteractionSummary(db, postId, userId);
};

export const createPostRepost = async (params: {
	db: Database;
	publicUrl: string;
	postId: string;
	userId: string;
}) => {
	const { db, publicUrl, postId, userId } = params;
	const targetPost = await assertPostExists(db, postId);

	const [savedRepost] = await db
		.insert(schema.postReposts)
		.values({
			id: uuidv7(),
			postId,
			userId,
		})
		.onConflictDoNothing({
			target: [schema.postReposts.postId, schema.postReposts.userId],
		})
		.returning({
			id: schema.postReposts.id,
		});

	if (savedRepost) {
		await createNotificationIfNeeded(db, publicUrl, {
			recipientUserId: targetPost.authorId,
			actorUserId: userId,
			type: "repost",
			postId,
			sourceType: "post_repost",
			sourceId: savedRepost.id,
			actionUrl: `/posts/${postId}`,
		});
	}

	return getPostInteractionSummary(db, postId, userId);
};

export const deletePostRepost = async (params: {
	db: Database;
	postId: string;
	userId: string;
}) => {
	const { db, postId, userId } = params;

	const deletedReposts = await db
		.delete(schema.postReposts)
		.where(
			and(
				eq(schema.postReposts.postId, postId),
				eq(schema.postReposts.userId, userId),
			),
		)
		.returning({
			id: schema.postReposts.id,
		});

	await removeNotificationsBySource(
		db,
		"post_repost",
		deletedReposts.map((repost) => repost.id),
	);

	return getPostInteractionSummary(db, postId, userId);
};
