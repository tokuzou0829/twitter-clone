import type { SendPushNotificationService } from "@/server/infrastructure/repositories/push-notification/interface";
import type {
	DeleteSubscriptionByIdService,
	FindAllSubscriptionsService,
	FindSubscriptionsByUserIdService,
	PushSubscriptionRecord,
} from "@/server/infrastructure/repositories/push-subscription/interface";
import {
	PushNotification,
	type PushNotificationInput,
} from "@/server/objects/push-notification";

export type SendPushNotificationSummary = {
	total: number;
	sent: number;
	failed: number;
	removed: number;
};

export const createSendPushNotificationToAll = (
	findAllSubscriptions: FindAllSubscriptionsService,
	sendPushNotification: SendPushNotificationService,
	deleteSubscriptionById: DeleteSubscriptionByIdService,
) => {
	return async (
		input: PushNotificationInput,
	): Promise<SendPushNotificationSummary> => {
		const payload = PushNotification(input);
		const subscriptions = await findAllSubscriptions();
		return sendBatch(
			subscriptions,
			payload,
			sendPushNotification,
			deleteSubscriptionById,
		);
	};
};

export const createSendPushNotificationToUser = (
	findSubscriptionsByUserId: FindSubscriptionsByUserIdService,
	sendPushNotification: SendPushNotificationService,
	deleteSubscriptionById: DeleteSubscriptionByIdService,
) => {
	return async (
		userId: string,
		input: PushNotificationInput,
	): Promise<SendPushNotificationSummary> => {
		const payload = PushNotification(input);
		const subscriptions = await findSubscriptionsByUserId(userId);
		return sendBatch(
			subscriptions,
			payload,
			sendPushNotification,
			deleteSubscriptionById,
		);
	};
};

const sendBatch = async (
	subscriptions: PushSubscriptionRecord[],
	payload: PushNotification,
	sendPushNotification: SendPushNotificationService,
	deleteSubscriptionById: DeleteSubscriptionByIdService,
): Promise<SendPushNotificationSummary> => {
	if (subscriptions.length === 0) {
		return { total: 0, sent: 0, failed: 0, removed: 0 };
	}

	const results = await Promise.all(
		subscriptions.map(async (subscription) => {
			try {
				await sendPushNotification(
					toWebPushSubscription(subscription),
					payload,
				);
				return { status: "sent" as const, subscription };
			} catch (error) {
				return { status: "failed" as const, subscription, error };
			}
		}),
	);

	let sent = 0;
	let failed = 0;
	const deleteIds: string[] = [];

	for (const result of results) {
		if (result.status === "sent") {
			sent += 1;
			continue;
		}

		failed += 1;
		if (isExpiredSubscriptionError(result.error)) {
			deleteIds.push(result.subscription.id);
		}
	}

	if (deleteIds.length > 0) {
		await Promise.all(deleteIds.map((id) => deleteSubscriptionById(id)));
	}

	return {
		total: subscriptions.length,
		sent,
		failed,
		removed: deleteIds.length,
	};
};

const toWebPushSubscription = (subscription: PushSubscriptionRecord) => {
	return {
		endpoint: subscription.endpoint,
		expirationTime: subscription.expirationTime ?? null,
		keys: {
			p256dh: subscription.p256dh,
			auth: subscription.auth,
		},
	};
};

const isExpiredSubscriptionError = (error: unknown) => {
	if (!error || typeof error !== "object") {
		return false;
	}

	const statusCode = (error as { statusCode?: number }).statusCode;
	return statusCode === 404 || statusCode === 410;
};
