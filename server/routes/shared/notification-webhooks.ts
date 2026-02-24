import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import { ValidationError } from "@/server/errors";
import {
	countUnreadNotifications,
	loadNotificationItems,
	type NotificationFilter,
} from "./notifications";

const WEBHOOK_TIMEOUT_MS = 5_000;
const WEBHOOK_USER_AGENT = "NumatterWebhook/1.0 (+https://numatter.app)";
const WEBHOOK_EVENT_NAME = "notifications.snapshot";

type StoredNotificationWebhook = {
	id: string;
	endpoint: string;
	secret: string;
};

type NotificationWebhookTrigger = {
	notificationId: string;
	type: string;
	sourceType: string;
	sourceId: string;
};

type NotificationWebhookPayload = {
	event: typeof WEBHOOK_EVENT_NAME;
	generatedAt: string;
	recipientUserId: string;
	filter: NotificationFilter;
	unreadCount: number;
	items: Awaited<ReturnType<typeof loadNotificationItems>>;
	trigger: NotificationWebhookTrigger | null;
};

type NotificationWebhookSendResult = {
	webhookId: string | null;
	endpoint: string;
	status: "success" | "failed";
	statusCode: number | null;
	error: string | null;
};

export const assertSupportedWebhookEndpoint = (value: string) => {
	const normalized = value.trim();
	if (!normalized) {
		throw new ValidationError("Webhook endpoint is required");
	}

	let url: URL;
	try {
		url = new URL(normalized);
	} catch {
		throw new ValidationError("Webhook endpoint must be a valid URL");
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new ValidationError("Webhook endpoint must use HTTP or HTTPS");
	}

	if (isBlockedHostname(url.hostname)) {
		throw new ValidationError("Webhook endpoint host is not allowed");
	}

	return url.toString();
};

export const dispatchNotificationWebhooksForRecipient = async (params: {
	db: Database;
	publicUrl: string;
	recipientUserId: string;
	trigger: NotificationWebhookTrigger;
}) => {
	const { db, publicUrl, recipientUserId, trigger } = params;
	const webhooks = await db
		.select({
			id: schema.developerNotificationWebhooks.id,
			endpoint: schema.developerNotificationWebhooks.endpoint,
			secret: schema.developerNotificationWebhooks.secret,
		})
		.from(schema.developerNotificationWebhooks)
		.where(
			and(
				eq(schema.developerNotificationWebhooks.userId, recipientUserId),
				eq(schema.developerNotificationWebhooks.isActive, true),
			),
		);

	if (webhooks.length === 0) {
		return [] as NotificationWebhookSendResult[];
	}

	const payload = await buildNotificationWebhookPayload({
		db,
		publicUrl,
		recipientUserId,
		type: "all",
		trigger,
	});

	return deliverStoredNotificationWebhooks({
		db,
		webhooks,
		payload,
	});
};

export const buildNotificationWebhookPayload = async (params: {
	db: Database;
	publicUrl: string;
	recipientUserId: string;
	type: NotificationFilter;
	trigger?: NotificationWebhookTrigger;
}) => {
	const { db, publicUrl, recipientUserId, type, trigger } = params;
	const [items, unreadCount] = await Promise.all([
		loadNotificationItems({
			db,
			publicUrl,
			recipientUserId,
			type,
			markAllAsRead: false,
		}),
		countUnreadNotifications(db, recipientUserId),
	]);

	return {
		event: WEBHOOK_EVENT_NAME,
		generatedAt: new Date().toISOString(),
		recipientUserId,
		filter: type,
		unreadCount,
		items,
		trigger: trigger ?? null,
	} as const satisfies NotificationWebhookPayload;
};

export const deliverStoredNotificationWebhooks = async (params: {
	db: Database;
	webhooks: StoredNotificationWebhook[];
	payload: NotificationWebhookPayload;
}) => {
	const { db, webhooks, payload } = params;

	return Promise.all(
		webhooks.map(async (webhook) => {
			const result = await sendNotificationWebhook({
				endpoint: webhook.endpoint,
				secret: webhook.secret,
				payload,
				webhookId: webhook.id,
			});

			const now = new Date();
			if (result.status === "success") {
				await db
					.update(schema.developerNotificationWebhooks)
					.set({
						lastSentAt: now,
						lastStatusCode: result.statusCode,
						lastError: null,
						updatedAt: now,
					})
					.where(eq(schema.developerNotificationWebhooks.id, webhook.id));
			} else {
				await db
					.update(schema.developerNotificationWebhooks)
					.set({
						lastStatusCode: result.statusCode,
						lastError: result.error,
						updatedAt: now,
					})
					.where(eq(schema.developerNotificationWebhooks.id, webhook.id));
			}

			return result;
		}),
	);
};

export const sendAdHocNotificationWebhook = async (params: {
	endpoint: string;
	secret: string;
	payload: NotificationWebhookPayload;
}) => {
	return sendNotificationWebhook({
		endpoint: params.endpoint,
		secret: params.secret,
		payload: params.payload,
		webhookId: null,
	});
};

const sendNotificationWebhook = async (params: {
	endpoint: string;
	secret: string;
	payload: NotificationWebhookPayload;
	webhookId: string | null;
}): Promise<NotificationWebhookSendResult> => {
	const { endpoint, secret, payload, webhookId } = params;
	const payloadText = JSON.stringify(payload);
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = createWebhookSignature(secret, timestamp, payloadText);

	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": WEBHOOK_USER_AGENT,
				"X-Numatter-Event": payload.event,
				"X-Numatter-Delivery-Id": uuidv7(),
				"X-Numatter-Timestamp": timestamp,
				"X-Numatter-Signature": `sha256=${signature}`,
			},
			body: payloadText,
			signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
		});

		if (!response.ok) {
			return {
				webhookId,
				endpoint,
				status: "failed",
				statusCode: response.status,
				error: `Webhook request failed with status ${response.status}`,
			};
		}

		return {
			webhookId,
			endpoint,
			status: "success",
			statusCode: response.status,
			error: null,
		};
	} catch (error) {
		return {
			webhookId,
			endpoint,
			status: "failed",
			statusCode: null,
			error: error instanceof Error ? error.message : "Webhook request failed",
		};
	}
};

const createWebhookSignature = (
	secret: string,
	timestamp: string,
	payloadText: string,
) => {
	return createHmac("sha256", secret)
		.update(`${timestamp}.${payloadText}`)
		.digest("hex");
};

const isBlockedHostname = (hostname: string) => {
	const normalized = hostname.toLowerCase();
	if (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal")
	) {
		return true;
	}

	if (normalized === "::1") {
		return true;
	}

	if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
		return true;
	}

	if (normalized.startsWith("fe80:")) {
		return true;
	}

	const ipv4Match = normalized.match(
		/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u,
	);
	if (!ipv4Match) {
		return false;
	}

	const octets = ipv4Match
		.slice(1)
		.map((segment) => Number.parseInt(segment, 10));
	if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
		return true;
	}

	const [first, second] = octets;
	if (
		first === 10 ||
		first === 127 ||
		first === 0 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	) {
		return true;
	}

	return false;
};
