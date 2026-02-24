import { and, count, desc, eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import { loadPostSummaryMap } from "./social";

export const NOTIFICATION_FILTER_VALUES = [
	"all",
	"follow",
	"like",
	"repost",
	"quote",
	"info",
] as const;

export type NotificationFilter = (typeof NOTIFICATION_FILTER_VALUES)[number];

type NotificationType = Exclude<NotificationFilter, "all"> | "violation";

type NotificationActor = {
	id: string;
	name: string;
	handle: string | null;
	image: string | null;
	bio: string | null;
	bannerImage: string | null;
};

type NotificationStack = {
	id: string;
	type: NotificationType;
	createdAt: Date;
	actorIds: Set<string>;
	actors: NotificationActor[];
	postId: string | null;
	quotePostId: string | null;
	title: string | null;
	body: string | null;
	actionUrl: string | null;
};

const MAX_NOTIFICATION_ROWS = 120;
const MAX_NOTIFICATION_ITEMS = 60;
const MAX_NOTIFICATION_ACTORS = 3;

export const countUnreadNotifications = async (
	db: Database,
	recipientUserId: string,
) => {
	const [result] = await db
		.select({ count: count() })
		.from(schema.notifications)
		.where(
			and(
				eq(schema.notifications.recipientUserId, recipientUserId),
				isNull(schema.notifications.readAt),
			),
		);

	return Number(result?.count ?? 0);
};

export const loadNotificationItems = async (params: {
	db: Database;
	publicUrl: string;
	recipientUserId: string;
	type?: NotificationFilter;
	markAllAsRead?: boolean;
}) => {
	const {
		db,
		publicUrl,
		recipientUserId,
		type = "all",
		markAllAsRead = false,
	} = params;
	const isAllType = type === "all";

	if (markAllAsRead && isAllType) {
		await db
			.update(schema.notifications)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(schema.notifications.recipientUserId, recipientUserId),
					isNull(schema.notifications.readAt),
				),
			);
	}

	const rows = await db
		.select({
			id: schema.notifications.id,
			type: schema.notifications.type,
			createdAt: schema.notifications.createdAt,
			actorUserId: schema.notifications.actorUserId,
			postId: schema.notifications.postId,
			quotePostId: schema.notifications.quotePostId,
			title: schema.notifications.title,
			body: schema.notifications.body,
			actionUrl: schema.notifications.actionUrl,
			actorId: schema.user.id,
			actorName: schema.user.name,
			actorHandle: schema.user.handle,
			actorImage: schema.user.image,
			actorBio: schema.user.bio,
			actorBannerImage: schema.user.bannerImage,
		})
		.from(schema.notifications)
		.leftJoin(schema.user, eq(schema.notifications.actorUserId, schema.user.id))
		.where(
			isAllType
				? eq(schema.notifications.recipientUserId, recipientUserId)
				: and(
						eq(schema.notifications.recipientUserId, recipientUserId),
						eq(schema.notifications.type, type),
					),
		)
		.orderBy(desc(schema.notifications.createdAt))
		.limit(MAX_NOTIFICATION_ROWS);

	const stacks = stackNotificationRows(rows).slice(0, MAX_NOTIFICATION_ITEMS);
	const postIds = [
		...new Set(
			stacks
				.map((stack) => stack.postId)
				.filter((postId): postId is string => Boolean(postId)),
		),
	];
	const quotePostIds = [
		...new Set(
			stacks
				.map((stack) => stack.quotePostId)
				.filter((postId): postId is string => Boolean(postId)),
		),
	];

	const [postMap, quotePostMap] = await Promise.all([
		loadPostSummaryMap({
			db,
			publicUrl,
			postIds,
			viewerId: recipientUserId,
		}),
		loadPostSummaryMap({
			db,
			publicUrl,
			postIds: quotePostIds,
			viewerId: recipientUserId,
		}),
	]);

	return stacks.map((stack) => ({
		id: stack.id,
		type: stack.type,
		createdAt: stack.createdAt.toISOString(),
		actors: stack.actors.slice(0, MAX_NOTIFICATION_ACTORS),
		actorCount: stack.actorIds.size,
		post: stack.postId ? (postMap.get(stack.postId) ?? null) : null,
		quotePost: stack.quotePostId
			? (quotePostMap.get(stack.quotePostId) ?? null)
			: null,
		title: stack.title,
		body: stack.body,
		actionUrl: resolveActionUrl(stack),
	}));
};

const stackNotificationRows = (
	rows: Array<{
		id: string;
		type: string;
		createdAt: Date;
		actorUserId: string | null;
		postId: string | null;
		quotePostId: string | null;
		title: string | null;
		body: string | null;
		actionUrl: string | null;
		actorId: string | null;
		actorName: string | null;
		actorHandle: string | null;
		actorImage: string | null;
		actorBio: string | null;
		actorBannerImage: string | null;
	}>,
) => {
	const stacks = new Map<string, NotificationStack>();

	for (const row of rows) {
		if (!isSupportedNotificationType(row.type)) {
			continue;
		}

		const stackKey = createNotificationStackKey(row.type, row.postId, row.id);
		const existing = stacks.get(stackKey);
		if (!existing) {
			stacks.set(stackKey, {
				id: stackKey,
				type: row.type,
				createdAt: row.createdAt,
				actorIds: new Set<string>(),
				actors: [],
				postId: row.postId,
				quotePostId: row.quotePostId,
				title: row.title,
				body: row.body,
				actionUrl: row.actionUrl,
			});
		}

		const stack = stacks.get(stackKey);
		if (!stack) {
			continue;
		}

		if (row.createdAt > stack.createdAt) {
			stack.createdAt = row.createdAt;
		}
		if (!stack.quotePostId && row.quotePostId) {
			stack.quotePostId = row.quotePostId;
		}
		if (!stack.title && row.title) {
			stack.title = row.title;
		}
		if (!stack.body && row.body) {
			stack.body = row.body;
		}
		if (!stack.actionUrl && row.actionUrl) {
			stack.actionUrl = row.actionUrl;
		}

		if (!row.actorUserId || !row.actorId || !row.actorName) {
			continue;
		}
		if (stack.actorIds.has(row.actorUserId)) {
			continue;
		}

		stack.actorIds.add(row.actorUserId);
		stack.actors.push({
			id: row.actorId,
			name: row.actorName,
			handle: row.actorHandle,
			image: row.actorImage,
			bio: row.actorBio,
			bannerImage: row.actorBannerImage,
		});
	}

	return [...stacks.values()];
};

const resolveActionUrl = (stack: NotificationStack) => {
	if (stack.actionUrl) {
		return stack.actionUrl;
	}

	if (stack.type === "follow") {
		const primaryActor = stack.actors[0];
		return primaryActor ? `/users/${primaryActor.id}` : null;
	}

	if (stack.type === "quote" && stack.quotePostId) {
		return `/posts/${stack.quotePostId}`;
	}

	if (stack.postId) {
		return `/posts/${stack.postId}`;
	}

	return null;
};

const isSupportedNotificationType = (
	value: string,
): value is NotificationType => {
	return ["follow", "like", "repost", "quote", "info", "violation"].includes(
		value,
	);
};

const createNotificationStackKey = (
	type: NotificationType,
	postId: string | null,
	notificationId: string,
) => {
	if (type === "follow") {
		return "follow";
	}

	if ((type === "like" || type === "repost" || type === "quote") && postId) {
		return `${type}:${postId}`;
	}

	return `${type}:${notificationId}`;
};
