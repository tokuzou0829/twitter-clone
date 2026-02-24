import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import * as schema from "@/db/schema";

import {
	createGetPushSubscriptionStatus,
	createRegisterPushSubscription,
	createRemovePushSubscription,
} from "@/server/applications/usecases/push-subscription";
import { createSendPushNotificationToUser } from "@/server/applications/usecases/send-push-notification";
import { createHonoApp } from "@/server/create-app";
import { createPushNotificationRepository } from "@/server/infrastructure/repositories/push-notification";
import { createPushSubscriptionRepository } from "@/server/infrastructure/repositories/push-subscription";
import {
	getDeveloperUserOrThrow,
	getUserOrThrow,
} from "@/server/middleware/auth";
import { PushNotification } from "@/server/objects/push-notification";
import { PushSubscription } from "@/server/objects/push-subscription";
import { loadPostSummaryMap } from "./shared/social";

const endpointQuerySchema = z.object({
	endpoint: z.string().url(),
});

const notificationsQuerySchema = z.object({
	type: z.enum(["all", "follow", "like", "repost", "quote", "info"]).optional(),
});

const systemNotificationSchema = z.object({
	recipientUserId: z.string().min(1),
	type: z.enum(["info", "violation"]),
	title: z.string().trim().min(1).max(120),
	body: z.string().trim().min(1).max(2000),
	actionUrl: z.string().trim().max(2048).nullable().optional(),
});

const MAX_NOTIFICATION_ROWS = 120;
const MAX_NOTIFICATION_ITEMS = 60;
const MAX_NOTIFICATION_ACTORS = 3;

const app = createHonoApp()
	.get("/", zValidator("query", notificationsQuerySchema), async (c) => {
		const { user } = await getUserOrThrow(c);
		const { type = "all" } = c.req.valid("query");
		const db = c.get("db");

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
			.leftJoin(
				schema.user,
				eq(schema.notifications.actorUserId, schema.user.id),
			)
			.where(
				type === "all"
					? eq(schema.notifications.recipientUserId, user.id)
					: and(
							eq(schema.notifications.recipientUserId, user.id),
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
				publicUrl: c.get("r2").publicUrl,
				postIds,
				viewerId: user.id,
			}),
			loadPostSummaryMap({
				db,
				publicUrl: c.get("r2").publicUrl,
				postIds: quotePostIds,
				viewerId: user.id,
			}),
		]);

		return c.json({
			items: stacks.map((stack) => ({
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
			})),
		});
	})
	.post("/system", zValidator("json", systemNotificationSchema), async (c) => {
		const { user } = await getDeveloperUserOrThrow(c);
		const payload = c.req.valid("json");
		const db = c.get("db");

		const [recipient] = await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.id, payload.recipientUserId))
			.limit(1);

		if (!recipient) {
			throw new HTTPException(404, { message: "Recipient user not found" });
		}

		const sourceId = uuidv7();
		const [saved] = await db
			.insert(schema.notifications)
			.values({
				id: uuidv7(),
				recipientUserId: payload.recipientUserId,
				actorUserId: user.id,
				type: payload.type,
				sourceType: "system_manual",
				sourceId,
				title: payload.title,
				body: payload.body,
				actionUrl: normalizeActionUrl(payload.actionUrl),
				createdAt: new Date(),
			})
			.returning({ id: schema.notifications.id });

		if (!saved) {
			throw new Error("Failed to create system notification");
		}

		return c.json({ notificationId: saved.id }, 201);
	})
	.post(
		"/subscriptions",
		zValidator("json", PushSubscription.schema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const payload = c.req.valid("json");
			const repository = createPushSubscriptionRepository(c.get("db"));
			const registerSubscription = createRegisterPushSubscription(
				repository.saveSubscription,
			);
			const saved = await registerSubscription(user.id, payload);

			return c.json({
				subscriptionId: saved.id,
			});
		},
	)
	.get(
		"/subscriptions",
		zValidator("query", endpointQuerySchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { endpoint } = c.req.valid("query");
			const repository = createPushSubscriptionRepository(c.get("db"));
			const getStatus = createGetPushSubscriptionStatus(
				repository.findSubscriptionByEndpointAndUserId,
			);
			const status = await getStatus(user.id, endpoint);

			return c.json(status);
		},
	)
	.delete(
		"/subscriptions",
		zValidator("query", endpointQuerySchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { endpoint } = c.req.valid("query");
			const repository = createPushSubscriptionRepository(c.get("db"));
			const removeSubscription = createRemovePushSubscription(
				repository.deleteSubscriptionByEndpointAndUserId,
			);
			const result = await removeSubscription(user.id, endpoint);

			return c.json(result);
		},
	)
	.post(
		"/send-test",
		zValidator("json", PushNotification.schema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const payload = c.req.valid("json");
			const subscriptionRepository = createPushSubscriptionRepository(
				c.get("db"),
			);
			const notificationRepository = createPushNotificationRepository();
			const sendToUser = createSendPushNotificationToUser(
				subscriptionRepository.findSubscriptionsByUserId,
				notificationRepository.sendPushNotification,
				subscriptionRepository.deleteSubscriptionById,
			);
			const summary = await sendToUser(user.id, payload);

			return c.json(summary);
		},
	);

export default app;

type NotificationType =
	| "follow"
	| "like"
	| "repost"
	| "quote"
	| "info"
	| "violation";

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

const normalizeActionUrl = (value: string | null | undefined) => {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	return normalized || null;
};
