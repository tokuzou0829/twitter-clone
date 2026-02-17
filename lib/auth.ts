import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, ne } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import {
	createAutoUserHandleCandidates,
	parseUserHandle,
} from "@/lib/user-handle";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	user: {
		additionalFields: {
			handle: {
				type: "string",
				required: false,
				input: false,
			},
			isDeveloper: {
				type: "boolean",
				required: false,
				input: false,
			},
			isBanned: {
				type: "boolean",
				required: false,
				input: false,
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (createdUser, context) => {
					const existingHandle = parseUserHandle(
						typeof createdUser.handle === "string" ? createdUser.handle : null,
					);

					if (existingHandle) {
						return;
					}

					const candidateHandle = await findAvailableHandleByUserId(
						createdUser.id,
					);
					if (!candidateHandle) {
						return;
					}

					if (context?.context) {
						await context.context.internalAdapter.updateUser(createdUser.id, {
							handle: candidateHandle,
						});
					} else {
						await db
							.update(schema.user)
							.set({
								handle: candidateHandle,
								updatedAt: new Date(),
							})
							.where(eq(schema.user.id, createdUser.id));
					}

					createdUser.handle = candidateHandle;
				},
			},
		},
		session: {
			create: {
				before: async (session) => {
					const [targetUser] = await db
						.select({
							isBanned: schema.user.isBanned,
						})
						.from(schema.user)
						.where(eq(schema.user.id, session.userId))
						.limit(1);

					if (targetUser?.isBanned) {
						return false;
					}
				},
			},
		},
	},
	emailAndPassword: {
		enabled: true,
	},
});

const findAvailableHandleByUserId = async (
	userId: string,
): Promise<string | null> => {
	for (const candidate of createAutoUserHandleCandidates(userId)) {
		const [existingUser] = await db
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(and(eq(schema.user.handle, candidate), ne(schema.user.id, userId)))
			.limit(1);

		if (!existingUser) {
			return candidate;
		}
	}

	return null;
};
