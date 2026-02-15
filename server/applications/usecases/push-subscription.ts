import { uuidv7 } from "uuidv7";

import type {
	DeleteSubscriptionByEndpointAndUserIdService,
	FindSubscriptionByEndpointAndUserIdService,
	SavePushSubscriptionService,
} from "@/server/infrastructure/repositories/push-subscription/interface";
import {
	PushSubscription,
	type PushSubscriptionInput,
} from "@/server/objects/push-subscription";

export const createRegisterPushSubscription = (
	saveSubscription: SavePushSubscriptionService,
) => {
	return async (userId: string, input: PushSubscriptionInput) => {
		const subscription = PushSubscription(input);
		const id = uuidv7();
		return saveSubscription({ id, userId, subscription });
	};
};

export const createGetPushSubscriptionStatus = (
	findSubscription: FindSubscriptionByEndpointAndUserIdService,
) => {
	return async (userId: string, endpoint: string) => {
		const record = await findSubscription({ userId, endpoint });
		return { subscribed: Boolean(record) };
	};
};

export const createRemovePushSubscription = (
	deleteSubscription: DeleteSubscriptionByEndpointAndUserIdService,
) => {
	return async (userId: string, endpoint: string) => {
		await deleteSubscription({ userId, endpoint });
		return { deleted: true };
	};
};
