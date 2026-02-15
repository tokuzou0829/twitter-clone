import webPush from "web-push";

import type { SendPushNotificationService } from "./interface";

export const createPushNotificationRepository = () => ({
	sendPushNotification: createSendPushNotification(),
});

const createSendPushNotification = (): SendPushNotificationService => {
	const subject = "https://tokuly.com/support";
	const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;

	if (!subject || !publicKey || !privateKey) {
		throw new Error("VAPID configuration is missing");
	}

	webPush.setVapidDetails(subject, publicKey, privateKey);

	return async (subscription, payload) => {
		await webPush.sendNotification(subscription, JSON.stringify(payload));
	};
};
