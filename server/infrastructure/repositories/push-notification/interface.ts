import type { PushNotification } from "@/server/objects/push-notification";
import type { PushSubscription } from "@/server/objects/push-subscription";

export type SendPushNotificationService = (
	subscription: PushSubscription,
	payload: PushNotification,
) => Promise<void>;
