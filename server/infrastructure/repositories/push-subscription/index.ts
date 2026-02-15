import { and, eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import type {
	DeleteSubscriptionByEndpointAndUserIdService,
	DeleteSubscriptionByIdService,
	FindAllSubscriptionsService,
	FindSubscriptionByEndpointAndUserIdService,
	FindSubscriptionsByUserIdService,
	SavePushSubscriptionService,
} from "./interface";

export const createPushSubscriptionRepository = (db: Database) => ({
	saveSubscription: createSaveSubscription(db),
	findSubscriptionByEndpointAndUserId:
		createFindSubscriptionByEndpointAndUserId(db),
	findSubscriptionsByUserId: createFindSubscriptionsByUserId(db),
	findAllSubscriptions: createFindAllSubscriptions(db),
	deleteSubscriptionByEndpointAndUserId:
		createDeleteSubscriptionByEndpointAndUserId(db),
	deleteSubscriptionById: createDeleteSubscriptionById(db),
});

const createSaveSubscription = (db: Database): SavePushSubscriptionService => {
	return async ({ id, userId, subscription }) => {
		const [saved] = await db
			.insert(schema.pushSubscription)
			.values({
				id,
				userId,
				endpoint: subscription.endpoint,
				p256dh: subscription.keys.p256dh,
				auth: subscription.keys.auth,
				expirationTime: subscription.expirationTime ?? null,
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					schema.pushSubscription.userId,
					schema.pushSubscription.endpoint,
				],
				set: {
					p256dh: subscription.keys.p256dh,
					auth: subscription.keys.auth,
					expirationTime: subscription.expirationTime ?? null,
					updatedAt: new Date(),
				},
			})
			.returning();

		if (!saved) {
			throw new Error("Failed to save push subscription");
		}

		return saved;
	};
};

const createFindSubscriptionByEndpointAndUserId = (
	db: Database,
): FindSubscriptionByEndpointAndUserIdService => {
	return async ({ userId, endpoint }) => {
		const [subscription] = await db
			.select()
			.from(schema.pushSubscription)
			.where(
				and(
					eq(schema.pushSubscription.userId, userId),
					eq(schema.pushSubscription.endpoint, endpoint),
				),
			)
			.limit(1);

		return subscription ?? null;
	};
};

const createFindSubscriptionsByUserId = (
	db: Database,
): FindSubscriptionsByUserIdService => {
	return async (userId) => {
		return db
			.select()
			.from(schema.pushSubscription)
			.where(eq(schema.pushSubscription.userId, userId));
	};
};

const createFindAllSubscriptions = (
	db: Database,
): FindAllSubscriptionsService => {
	return async () => {
		return db.select().from(schema.pushSubscription);
	};
};

const createDeleteSubscriptionByEndpointAndUserId = (
	db: Database,
): DeleteSubscriptionByEndpointAndUserIdService => {
	return async ({ userId, endpoint }) => {
		await db
			.delete(schema.pushSubscription)
			.where(
				and(
					eq(schema.pushSubscription.userId, userId),
					eq(schema.pushSubscription.endpoint, endpoint),
				),
			);
	};
};

const createDeleteSubscriptionById = (
	db: Database,
): DeleteSubscriptionByIdService => {
	return async (id) => {
		await db
			.delete(schema.pushSubscription)
			.where(eq(schema.pushSubscription.id, id));
	};
};
