import type * as schema from "@/db/schema";
import type { PushSubscription } from "@/server/objects/push-subscription";

export type PushSubscriptionRecord =
	typeof schema.pushSubscription.$inferSelect;

export type SavePushSubscriptionService = (params: {
	id: string;
	userId: string;
	subscription: PushSubscription;
}) => Promise<PushSubscriptionRecord>;

export type FindSubscriptionByEndpointAndUserIdService = (params: {
	userId: string;
	endpoint: string;
}) => Promise<PushSubscriptionRecord | null>;

export type FindSubscriptionsByUserIdService = (
	userId: string,
) => Promise<PushSubscriptionRecord[]>;

export type FindAllSubscriptionsService = () => Promise<
	PushSubscriptionRecord[]
>;

export type DeleteSubscriptionByEndpointAndUserIdService = (params: {
	userId: string;
	endpoint: string;
}) => Promise<void>;

export type DeleteSubscriptionByIdService = (id: string) => Promise<void>;
