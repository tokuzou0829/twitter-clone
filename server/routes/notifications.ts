import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
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
import { dispatchNotificationWebhooksForRecipient } from "./shared/notification-webhooks";
import {
	countUnreadNotifications,
	loadNotificationItems,
	NOTIFICATION_FILTER_VALUES,
} from "./shared/notifications";

const endpointQuerySchema = z.object({
	endpoint: z.string().url(),
});

const notificationsQuerySchema = z.object({
	type: z.enum(NOTIFICATION_FILTER_VALUES).optional(),
});

const systemNotificationSchema = z.object({
	recipientUserId: z.string().min(1),
	type: z.enum(["info", "violation"]),
	title: z.string().trim().min(1).max(120),
	body: z.string().trim().min(1).max(2000),
	actionUrl: z.string().trim().max(2048).nullable().optional(),
});

const app = createHonoApp()
	.get("/unread-count", async (c) => {
		const { user } = await getUserOrThrow(c);
		const count = await countUnreadNotifications(c.get("db"), user.id);
		return c.json({ count });
	})
	.get("/", zValidator("query", notificationsQuerySchema), async (c) => {
		const { user } = await getUserOrThrow(c);
		const { type = "all" } = c.req.valid("query");
		const items = await loadNotificationItems({
			db: c.get("db"),
			publicUrl: c.get("r2").publicUrl,
			recipientUserId: user.id,
			type,
			markAllAsRead: type === "all",
		});

		return c.json({
			items,
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

		await dispatchNotificationWebhooksForRecipient({
			db,
			publicUrl: c.get("r2").publicUrl,
			recipientUserId: payload.recipientUserId,
			trigger: {
				notificationId: saved.id,
				type: payload.type,
				sourceType: "system_manual",
				sourceId,
			},
		}).catch(() => undefined);

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

const normalizeActionUrl = (value: string | null | undefined) => {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	return normalized || null;
};
