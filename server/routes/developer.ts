import { createHash, randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import {
	countPostContentLength,
	extractUniquePostLinks,
	MAX_POST_CONTENT_LENGTH,
	type PostLink,
} from "@/lib/post-content";
import {
	isValidUserHandle,
	MAX_HANDLE_LENGTH,
	normalizeUserHandle,
} from "@/lib/user-handle";
import { ValidationError } from "@/server/errors";
import { createFileRepository } from "@/server/infrastructure/repositories/file";
import { getDeveloperUserOrThrow } from "@/server/middleware/auth";
import { createBlobFile } from "@/server/objects/file";
import { createHonoApp } from "../create-app";
import {
	assertSupportedWebhookEndpoint,
	buildNotificationWebhookPayload,
	deliverStoredNotificationWebhooks,
	sendAdHocNotificationWebhook,
} from "./shared/notification-webhooks";
import {
	countUnreadNotifications,
	loadNotificationItemById,
	loadNotificationItems,
	NOTIFICATION_FILTER_VALUES,
} from "./shared/notifications";
import {
	assertPostExists,
	createNotificationIfNeeded,
	createPostLike,
	createPostRepost,
	deletePostLike,
	deletePostRepost,
} from "./shared/post-interactions";
import { loadPostSummaryMap } from "./shared/social";

const MAX_PROFILE_NAME_LENGTH = 50;
const MAX_PROFILE_BIO_LENGTH = 160;

const DEVELOPER_API_TOKEN_PREFIX = "nmt_dev_";
const DEVELOPER_API_TOKEN_PREFIX_LENGTH = 20;
const DEVELOPER_API_TOKEN_NAME_MAX_LENGTH = 64;
const DEVELOPER_API_TOKEN_MIN_EXPIRES_IN_DAYS = 1;
const DEVELOPER_API_TOKEN_MAX_EXPIRES_IN_DAYS = 365;
const DEVELOPER_API_TOKEN_RANDOM_BYTES = 32;

const DEVELOPER_API_TOKEN_DEFAULT_EXPIRES_IN_DAYS = 90;

const DEVELOPER_NOTIFICATION_WEBHOOK_NAME_MAX_LENGTH = 64;
const DEVELOPER_NOTIFICATION_WEBHOOK_ENDPOINT_MAX_LENGTH = 2048;
const DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MIN_LENGTH = 8;
const DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MAX_LENGTH = 256;
const DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_PREFIX = "nmt_whsec_";
const DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_RANDOM_BYTES = 24;

const DEVELOPER_API_POST_LIMITS = {
	maxImages: 2,
	maxImageSizeBytes: 3 * 1024 * 1024,
	allowedImageMimeTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

const DEVELOPER_API_ALLOWED_IMAGE_MIME_TYPE_SET = new Set<string>(
	DEVELOPER_API_POST_LIMITS.allowedImageMimeTypes,
);

const tokenIdParamSchema = z.object({
	tokenId: z.string().min(1),
});

const tokenCreateSchema = z.object({
	name: z.string().trim().min(1).max(DEVELOPER_API_TOKEN_NAME_MAX_LENGTH),
	expiresInDays: z
		.number()
		.int()
		.min(DEVELOPER_API_TOKEN_MIN_EXPIRES_IN_DAYS)
		.max(DEVELOPER_API_TOKEN_MAX_EXPIRES_IN_DAYS)
		.nullable()
		.optional(),
});

const profilePatchSchema = z
	.object({
		name: z.string().trim().max(MAX_PROFILE_NAME_LENGTH).optional(),
		handle: z.string().trim().max(MAX_HANDLE_LENGTH).nullable().optional(),
		bio: z.string().trim().max(MAX_PROFILE_BIO_LENGTH).nullable().optional(),
	})
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one profile field is required",
	});

const postIdParamSchema = z.object({
	postId: z.string().min(1),
});

const developerNotificationsQuerySchema = z.object({
	type: z.enum(NOTIFICATION_FILTER_VALUES).optional(),
	markAsRead: z.enum(["true", "false"]).optional(),
});

const notificationIdParamSchema = z.object({
	notificationId: z.string().trim().min(1),
});

const webhookIdParamSchema = z.object({
	webhookId: z.string().min(1),
});

const webhookCreateSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(DEVELOPER_NOTIFICATION_WEBHOOK_NAME_MAX_LENGTH),
	endpoint: z
		.string()
		.trim()
		.url()
		.max(DEVELOPER_NOTIFICATION_WEBHOOK_ENDPOINT_MAX_LENGTH),
	secret: z
		.string()
		.trim()
		.min(DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MIN_LENGTH)
		.max(DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MAX_LENGTH)
		.optional(),
	isActive: z.boolean().optional(),
});

const webhookPatchSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1)
			.max(DEVELOPER_NOTIFICATION_WEBHOOK_NAME_MAX_LENGTH)
			.optional(),
		endpoint: z
			.string()
			.trim()
			.url()
			.max(DEVELOPER_NOTIFICATION_WEBHOOK_ENDPOINT_MAX_LENGTH)
			.optional(),
		secret: z
			.string()
			.trim()
			.min(DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MIN_LENGTH)
			.max(DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MAX_LENGTH)
			.optional(),
		rotateSecret: z.boolean().optional(),
		isActive: z.boolean().optional(),
	})
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "At least one webhook field is required",
	})
	.superRefine((payload, ctx) => {
		if (payload.rotateSecret && payload.secret) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "rotateSecret and secret cannot be set together",
				path: ["secret"],
			});
		}
	});

const webhookSendSchema = z
	.object({
		webhookId: z.string().trim().min(1).optional(),
		endpoint: z
			.string()
			.trim()
			.url()
			.max(DEVELOPER_NOTIFICATION_WEBHOOK_ENDPOINT_MAX_LENGTH)
			.optional(),
		secret: z
			.string()
			.trim()
			.min(DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MIN_LENGTH)
			.max(DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_MAX_LENGTH)
			.optional(),
		type: z.enum(NOTIFICATION_FILTER_VALUES).optional(),
	})
	.superRefine((payload, ctx) => {
		if (payload.webhookId && payload.endpoint) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "webhookId and endpoint cannot be set together",
				path: ["endpoint"],
			});
		}

		if (payload.secret && !payload.endpoint) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "secret requires endpoint",
				path: ["secret"],
			});
		}

		if (payload.endpoint && !payload.secret) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "secret is required for ad-hoc endpoint delivery",
				path: ["secret"],
			});
		}
	});

const webhookSingleSendSchema = z.object({
	type: z.enum(NOTIFICATION_FILTER_VALUES).optional(),
});

const developerApiTokenSelection = {
	id: schema.developerApiTokens.id,
	name: schema.developerApiTokens.name,
	tokenPrefix: schema.developerApiTokens.tokenPrefix,
	createdAt: schema.developerApiTokens.createdAt,
	expiresAt: schema.developerApiTokens.expiresAt,
	lastUsedAt: schema.developerApiTokens.lastUsedAt,
	revokedAt: schema.developerApiTokens.revokedAt,
};

const developerNotificationWebhookSelection = {
	id: schema.developerNotificationWebhooks.id,
	userId: schema.developerNotificationWebhooks.userId,
	name: schema.developerNotificationWebhooks.name,
	endpoint: schema.developerNotificationWebhooks.endpoint,
	secret: schema.developerNotificationWebhooks.secret,
	isActive: schema.developerNotificationWebhooks.isActive,
	lastSentAt: schema.developerNotificationWebhooks.lastSentAt,
	lastStatusCode: schema.developerNotificationWebhooks.lastStatusCode,
	lastError: schema.developerNotificationWebhooks.lastError,
	createdAt: schema.developerNotificationWebhooks.createdAt,
	updatedAt: schema.developerNotificationWebhooks.updatedAt,
};

const app = createHonoApp()
	.get("/tokens", async (c) => {
		const { user } = await getDeveloperUserOrThrow(c);
		const tokenRows = await c
			.get("db")
			.select(developerApiTokenSelection)
			.from(schema.developerApiTokens)
			.where(eq(schema.developerApiTokens.userId, user.id))
			.orderBy(desc(schema.developerApiTokens.createdAt));

		return c.json({
			tokens: tokenRows.map(toDeveloperApiTokenSummary),
		});
	})
	.post("/tokens", zValidator("json", tokenCreateSchema), async (c) => {
		const { user } = await getDeveloperUserOrThrow(c);
		const { name, expiresInDays } = c.req.valid("json");
		const now = new Date();
		const expiresAt =
			expiresInDays === null
				? null
				: new Date(
						now.getTime() +
							(expiresInDays ?? DEVELOPER_API_TOKEN_DEFAULT_EXPIRES_IN_DAYS) *
								24 *
								60 *
								60 *
								1000,
					);

		const plainToken = createDeveloperApiTokenPlaintext();
		const tokenHash = hashDeveloperApiToken(plainToken);

		const [created] = await c
			.get("db")
			.insert(schema.developerApiTokens)
			.values({
				id: uuidv7(),
				userId: user.id,
				name,
				tokenHash,
				tokenPrefix: createTokenPrefix(plainToken),
				expiresAt,
				createdAt: now,
				updatedAt: now,
			})
			.returning(developerApiTokenSelection);

		if (!created) {
			throw new Error("Failed to create developer API token");
		}

		return c.json(
			{
				token: toDeveloperApiTokenSummary(created),
				plainToken,
			},
			201,
		);
	})
	.delete(
		"/tokens/:tokenId",
		zValidator("param", tokenIdParamSchema),
		async (c) => {
			const { user } = await getDeveloperUserOrThrow(c);
			const { tokenId } = c.req.valid("param");
			const db = c.get("db");

			const [target] = await db
				.select(developerApiTokenSelection)
				.from(schema.developerApiTokens)
				.where(
					and(
						eq(schema.developerApiTokens.id, tokenId),
						eq(schema.developerApiTokens.userId, user.id),
					),
				)
				.limit(1);

			if (!target) {
				throw new HTTPException(404, { message: "Token not found" });
			}

			if (target.revokedAt) {
				return c.json({
					token: toDeveloperApiTokenSummary(target),
				});
			}

			const now = new Date();
			const [revokedToken] = await db
				.update(schema.developerApiTokens)
				.set({
					revokedAt: now,
					updatedAt: now,
				})
				.where(eq(schema.developerApiTokens.id, tokenId))
				.returning(developerApiTokenSelection);

			if (!revokedToken) {
				throw new Error("Failed to revoke developer API token");
			}

			return c.json({
				token: toDeveloperApiTokenSummary(revokedToken),
			});
		},
	)
	.get("/notification-webhooks", async (c) => {
		const { user } = await getDeveloperUserOrThrow(c);
		const webhookRows = await c
			.get("db")
			.select(developerNotificationWebhookSelection)
			.from(schema.developerNotificationWebhooks)
			.where(eq(schema.developerNotificationWebhooks.userId, user.id))
			.orderBy(desc(schema.developerNotificationWebhooks.createdAt));

		return c.json({
			webhooks: webhookRows.map(toDeveloperNotificationWebhookSummary),
		});
	})
	.post(
		"/notification-webhooks",
		zValidator("json", webhookCreateSchema),
		async (c) => {
			const { user } = await getDeveloperUserOrThrow(c);
			const payload = c.req.valid("json");
			const db = c.get("db");
			const endpoint = assertSupportedWebhookEndpoint(payload.endpoint);

			const [existing] = await db
				.select({ id: schema.developerNotificationWebhooks.id })
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.userId, user.id),
						eq(schema.developerNotificationWebhooks.endpoint, endpoint),
					),
				)
				.limit(1);

			if (existing) {
				throw new HTTPException(409, {
					message: "Webhook endpoint is already registered",
				});
			}

			const plainSecret =
				payload.secret ?? createDeveloperNotificationWebhookSecret();
			const now = new Date();
			const [created] = await db
				.insert(schema.developerNotificationWebhooks)
				.values({
					id: uuidv7(),
					userId: user.id,
					name: payload.name,
					endpoint,
					secret: plainSecret,
					isActive: payload.isActive ?? true,
					createdAt: now,
					updatedAt: now,
				})
				.returning(developerNotificationWebhookSelection);

			if (!created) {
				throw new Error("Failed to create developer notification webhook");
			}

			return c.json(
				{
					webhook: toDeveloperNotificationWebhookSummary(created),
					plainSecret,
				},
				201,
			);
		},
	)
	.patch(
		"/notification-webhooks/:webhookId",
		zValidator("param", webhookIdParamSchema),
		zValidator("json", webhookPatchSchema),
		async (c) => {
			const { user } = await getDeveloperUserOrThrow(c);
			const { webhookId } = c.req.valid("param");
			const payload = c.req.valid("json");
			const db = c.get("db");

			const [current] = await db
				.select(developerNotificationWebhookSelection)
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.id, webhookId),
						eq(schema.developerNotificationWebhooks.userId, user.id),
					),
				)
				.limit(1);

			if (!current) {
				throw new HTTPException(404, { message: "Webhook not found" });
			}

			const nextEndpoint =
				payload.endpoint === undefined
					? current.endpoint
					: assertSupportedWebhookEndpoint(payload.endpoint);

			if (nextEndpoint !== current.endpoint) {
				const [duplicate] = await db
					.select({ id: schema.developerNotificationWebhooks.id })
					.from(schema.developerNotificationWebhooks)
					.where(
						and(
							eq(schema.developerNotificationWebhooks.userId, user.id),
							eq(schema.developerNotificationWebhooks.endpoint, nextEndpoint),
							ne(schema.developerNotificationWebhooks.id, webhookId),
						),
					)
					.limit(1);

				if (duplicate) {
					throw new HTTPException(409, {
						message: "Webhook endpoint is already registered",
					});
				}
			}

			const plainSecret = payload.rotateSecret
				? createDeveloperNotificationWebhookSecret()
				: payload.secret;

			const [updated] = await db
				.update(schema.developerNotificationWebhooks)
				.set({
					name: payload.name ?? current.name,
					endpoint: nextEndpoint,
					secret: plainSecret ?? current.secret,
					isActive: payload.isActive ?? current.isActive,
					updatedAt: new Date(),
				})
				.where(eq(schema.developerNotificationWebhooks.id, webhookId))
				.returning(developerNotificationWebhookSelection);

			if (!updated) {
				throw new Error("Failed to update developer notification webhook");
			}

			return c.json({
				webhook: toDeveloperNotificationWebhookSummary(updated),
				plainSecret: plainSecret ?? null,
			});
		},
	)
	.delete(
		"/notification-webhooks/:webhookId",
		zValidator("param", webhookIdParamSchema),
		async (c) => {
			const { user } = await getDeveloperUserOrThrow(c);
			const { webhookId } = c.req.valid("param");
			const db = c.get("db");

			const [target] = await db
				.select({ id: schema.developerNotificationWebhooks.id })
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.id, webhookId),
						eq(schema.developerNotificationWebhooks.userId, user.id),
					),
				)
				.limit(1);

			if (!target) {
				throw new HTTPException(404, { message: "Webhook not found" });
			}

			await db
				.delete(schema.developerNotificationWebhooks)
				.where(eq(schema.developerNotificationWebhooks.id, webhookId));

			return c.json({ deleted: true });
		},
	)
	.post(
		"/notification-webhooks/:webhookId/send",
		zValidator("param", webhookIdParamSchema),
		zValidator("json", webhookSingleSendSchema),
		async (c) => {
			const { user } = await getDeveloperUserOrThrow(c);
			const { webhookId } = c.req.valid("param");
			const payload = c.req.valid("json");
			const db = c.get("db");
			const snapshot = await buildNotificationWebhookPayload({
				db,
				publicUrl: c.get("r2").publicUrl,
				recipientUserId: user.id,
				type: payload.type ?? "all",
			});

			const [target] = await db
				.select({
					id: schema.developerNotificationWebhooks.id,
					endpoint: schema.developerNotificationWebhooks.endpoint,
					secret: schema.developerNotificationWebhooks.secret,
				})
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.id, webhookId),
						eq(schema.developerNotificationWebhooks.userId, user.id),
					),
				)
				.limit(1);

			if (!target) {
				throw new HTTPException(404, { message: "Webhook not found" });
			}

			const [result] = await deliverStoredNotificationWebhooks({
				db,
				webhooks: [target],
				payload: snapshot,
			});

			return c.json({
				deliveredAt: snapshot.generatedAt,
				unreadCount: snapshot.unreadCount,
				itemCount: snapshot.items.length,
				results: result ? [result] : [],
			});
		},
	)
	.get("/v1/profile", async (c) => {
		const user = await getDeveloperApiUserOrThrow(c);
		const profile = await buildDeveloperProfile(c.get("db"), user.id);
		return c.json({ profile });
	})
	.patch("/v1/profile", zValidator("json", profilePatchSchema), async (c) => {
		const user = await getDeveloperApiUserOrThrow(c);
		const payload = c.req.valid("json");
		const db = c.get("db");

		const [currentUser] = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				handle: schema.user.handle,
				bio: schema.user.bio,
			})
			.from(schema.user)
			.where(eq(schema.user.id, user.id))
			.limit(1);

		if (!currentUser) {
			throw new HTTPException(404, { message: "User not found" });
		}

		const nextName =
			payload.name === undefined
				? currentUser.name
				: validateName(payload.name);
		const nextBio =
			payload.bio === undefined ? currentUser.bio : validateBio(payload.bio);
		const nextHandle =
			payload.handle === undefined
				? currentUser.handle
				: await validateHandle(db, user.id, payload.handle);

		await db
			.update(schema.user)
			.set({
				name: nextName,
				bio: nextBio,
				handle: nextHandle,
				updatedAt: new Date(),
			})
			.where(eq(schema.user.id, user.id));

		const profile = await buildDeveloperProfile(db, user.id);
		return c.json({ profile });
	})
	.post("/v1/posts", async (c) => {
		const user = await getDeveloperApiUserOrThrow(c);
		const db = c.get("db");
		const formData = await c.req.formData();
		const payload = parseDeveloperPostFormData(formData);
		const replyTargetPost = payload.replyToPostId
			? await assertPostExists(db, payload.replyToPostId)
			: null;
		const quoteTargetPost = payload.quotePostId
			? await assertPostExists(db, payload.quotePostId)
			: null;

		const { client, baseUrl, bucketName, publicUrl } = c.get("r2");
		const fileRepository = createFileRepository(client, db, baseUrl);
		const post = await createPostWithImages({
			db,
			fileRepository,
			bucketName,
			publicUrl,
			authorId: user.id,
			content: payload.content,
			links: payload.links,
			images: payload.images,
			replyToPostId: payload.replyToPostId,
			quotePostId: payload.quotePostId,
		});

		if (replyTargetPost) {
			await createNotificationIfNeeded(db, publicUrl, {
				recipientUserId: replyTargetPost.authorId,
				actorUserId: user.id,
				type: "reply",
				postId: replyTargetPost.id,
				sourceType: "post_reply",
				sourceId: post.id,
				actionUrl: `/posts/${replyTargetPost.id}`,
			});
		}

		if (quoteTargetPost) {
			await createNotificationIfNeeded(db, publicUrl, {
				recipientUserId: quoteTargetPost.authorId,
				actorUserId: user.id,
				type: "quote",
				postId: quoteTargetPost.id,
				quotePostId: post.id,
				sourceType: "quote_post",
				sourceId: post.id,
				actionUrl: `/posts/${post.id}`,
			});
		}

		return c.json({ post }, 201);
	})
	.delete(
		"/v1/posts/:postId",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");
			const db = c.get("db");

			const [targetPost] = await db
				.select({
					id: schema.posts.id,
					authorId: schema.posts.authorId,
					replyToPostId: schema.posts.replyToPostId,
				})
				.from(schema.posts)
				.where(eq(schema.posts.id, postId))
				.limit(1);

			if (!targetPost) {
				throw new HTTPException(404, { message: "Post not found" });
			}

			if (targetPost.authorId !== user.id) {
				throw new HTTPException(403, {
					message: "You can only delete your own posts",
				});
			}

			const imageRows = await db
				.select({ fileId: schema.postImages.fileId })
				.from(schema.postImages)
				.where(eq(schema.postImages.postId, postId));

			await db
				.update(schema.posts)
				.set({
					replyToPostId: targetPost.replyToPostId,
					updatedAt: new Date(),
				})
				.where(eq(schema.posts.replyToPostId, postId));

			await db.delete(schema.posts).where(eq(schema.posts.id, postId));

			const fileIds = [
				...new Set(imageRows.map((imageRow) => imageRow.fileId)),
			];
			if (fileIds.length > 0) {
				const { client, baseUrl } = c.get("r2");
				const fileRepository = createFileRepository(client, db, baseUrl);
				await Promise.all(
					fileIds.map((fileId) =>
						fileRepository.deleteFileById(fileId).catch(() => undefined),
					),
				);
			}

			return c.body(null, 204);
		},
	)
	.post(
		"/v1/posts/:postId/likes",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");

			const summary = await createPostLike({
				db: c.get("db"),
				publicUrl: c.get("r2").publicUrl,
				postId,
				userId: user.id,
			});
			return c.json(summary);
		},
	)
	.delete(
		"/v1/posts/:postId/likes",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");

			const summary = await deletePostLike({
				db: c.get("db"),
				postId,
				userId: user.id,
			});
			return c.json(summary);
		},
	)
	.post(
		"/v1/posts/:postId/reposts",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");

			const summary = await createPostRepost({
				db: c.get("db"),
				publicUrl: c.get("r2").publicUrl,
				postId,
				userId: user.id,
			});
			return c.json(summary);
		},
	)
	.delete(
		"/v1/posts/:postId/reposts",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");

			const summary = await deletePostRepost({
				db: c.get("db"),
				postId,
				userId: user.id,
			});
			return c.json(summary);
		},
	)
	.get("/v1/notifications/unread-count", async (c) => {
		const user = await getDeveloperApiUserOrThrow(c);
		const count = await countUnreadNotifications(c.get("db"), user.id);
		return c.json({ count });
	})
	.get(
		"/v1/notifications",
		zValidator("query", developerNotificationsQuerySchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { type = "all", markAsRead } = c.req.valid("query");
			const items = await loadNotificationItems({
				db: c.get("db"),
				publicUrl: c.get("r2").publicUrl,
				recipientUserId: user.id,
				type,
				markAllAsRead: type === "all" && markAsRead === "true",
			});
			const unreadCount = await countUnreadNotifications(c.get("db"), user.id);

			return c.json({
				items,
				unreadCount,
			});
		},
	)
	.get("/v1/notifications/webhooks", async (c) => {
		const user = await getDeveloperApiUserOrThrow(c);
		const rows = await c
			.get("db")
			.select(developerNotificationWebhookSelection)
			.from(schema.developerNotificationWebhooks)
			.where(eq(schema.developerNotificationWebhooks.userId, user.id))
			.orderBy(desc(schema.developerNotificationWebhooks.createdAt));

		return c.json({
			webhooks: rows.map(toDeveloperNotificationWebhookSummary),
		});
	})
	.post(
		"/v1/notifications/webhooks",
		zValidator("json", webhookCreateSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const payload = c.req.valid("json");
			const db = c.get("db");
			const endpoint = assertSupportedWebhookEndpoint(payload.endpoint);

			const [existing] = await db
				.select({ id: schema.developerNotificationWebhooks.id })
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.userId, user.id),
						eq(schema.developerNotificationWebhooks.endpoint, endpoint),
					),
				)
				.limit(1);

			if (existing) {
				throw new HTTPException(409, {
					message: "Webhook endpoint is already registered",
				});
			}

			const plainSecret =
				payload.secret ?? createDeveloperNotificationWebhookSecret();
			const now = new Date();
			const [created] = await db
				.insert(schema.developerNotificationWebhooks)
				.values({
					id: uuidv7(),
					userId: user.id,
					name: payload.name,
					endpoint,
					secret: plainSecret,
					isActive: payload.isActive ?? true,
					createdAt: now,
					updatedAt: now,
				})
				.returning(developerNotificationWebhookSelection);

			if (!created) {
				throw new Error("Failed to create developer notification webhook");
			}

			return c.json(
				{
					webhook: toDeveloperNotificationWebhookSummary(created),
					plainSecret,
				},
				201,
			);
		},
	)
	.patch(
		"/v1/notifications/webhooks/:webhookId",
		zValidator("param", webhookIdParamSchema),
		zValidator("json", webhookPatchSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { webhookId } = c.req.valid("param");
			const payload = c.req.valid("json");
			const db = c.get("db");

			const [current] = await db
				.select(developerNotificationWebhookSelection)
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.id, webhookId),
						eq(schema.developerNotificationWebhooks.userId, user.id),
					),
				)
				.limit(1);

			if (!current) {
				throw new HTTPException(404, { message: "Webhook not found" });
			}

			const nextEndpoint =
				payload.endpoint === undefined
					? current.endpoint
					: assertSupportedWebhookEndpoint(payload.endpoint);

			if (nextEndpoint !== current.endpoint) {
				const [duplicate] = await db
					.select({ id: schema.developerNotificationWebhooks.id })
					.from(schema.developerNotificationWebhooks)
					.where(
						and(
							eq(schema.developerNotificationWebhooks.userId, user.id),
							eq(schema.developerNotificationWebhooks.endpoint, nextEndpoint),
							ne(schema.developerNotificationWebhooks.id, webhookId),
						),
					)
					.limit(1);

				if (duplicate) {
					throw new HTTPException(409, {
						message: "Webhook endpoint is already registered",
					});
				}
			}

			const plainSecret = payload.rotateSecret
				? createDeveloperNotificationWebhookSecret()
				: payload.secret;

			const [updated] = await db
				.update(schema.developerNotificationWebhooks)
				.set({
					name: payload.name ?? current.name,
					endpoint: nextEndpoint,
					secret: plainSecret ?? current.secret,
					isActive: payload.isActive ?? current.isActive,
					updatedAt: new Date(),
				})
				.where(eq(schema.developerNotificationWebhooks.id, webhookId))
				.returning(developerNotificationWebhookSelection);

			if (!updated) {
				throw new Error("Failed to update developer notification webhook");
			}

			return c.json({
				webhook: toDeveloperNotificationWebhookSummary(updated),
				plainSecret: plainSecret ?? null,
			});
		},
	)
	.delete(
		"/v1/notifications/webhooks/:webhookId",
		zValidator("param", webhookIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { webhookId } = c.req.valid("param");
			const db = c.get("db");

			const [target] = await db
				.select({ id: schema.developerNotificationWebhooks.id })
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.id, webhookId),
						eq(schema.developerNotificationWebhooks.userId, user.id),
					),
				)
				.limit(1);

			if (!target) {
				throw new HTTPException(404, { message: "Webhook not found" });
			}

			await db
				.delete(schema.developerNotificationWebhooks)
				.where(eq(schema.developerNotificationWebhooks.id, webhookId));

			return c.json({ deleted: true });
		},
	)
	.post(
		"/v1/notifications/webhooks/send",
		zValidator("json", webhookSendSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const payload = c.req.valid("json");
			const db = c.get("db");
			const type = payload.type ?? "all";
			const snapshot = await buildNotificationWebhookPayload({
				db,
				publicUrl: c.get("r2").publicUrl,
				recipientUserId: user.id,
				type,
			});

			if (payload.webhookId) {
				const [target] = await db
					.select({
						id: schema.developerNotificationWebhooks.id,
						endpoint: schema.developerNotificationWebhooks.endpoint,
						secret: schema.developerNotificationWebhooks.secret,
					})
					.from(schema.developerNotificationWebhooks)
					.where(
						and(
							eq(schema.developerNotificationWebhooks.id, payload.webhookId),
							eq(schema.developerNotificationWebhooks.userId, user.id),
						),
					)
					.limit(1);

				if (!target) {
					throw new HTTPException(404, { message: "Webhook not found" });
				}

				const [result] = await deliverStoredNotificationWebhooks({
					db,
					webhooks: [target],
					payload: snapshot,
				});

				return c.json({
					deliveredAt: snapshot.generatedAt,
					unreadCount: snapshot.unreadCount,
					itemCount: snapshot.items.length,
					results: result ? [result] : [],
				});
			}

			if (payload.endpoint && payload.secret) {
				const result = await sendAdHocNotificationWebhook({
					endpoint: assertSupportedWebhookEndpoint(payload.endpoint),
					secret: payload.secret,
					payload: snapshot,
				});

				return c.json({
					deliveredAt: snapshot.generatedAt,
					unreadCount: snapshot.unreadCount,
					itemCount: snapshot.items.length,
					results: [result],
				});
			}

			const webhooks = await db
				.select({
					id: schema.developerNotificationWebhooks.id,
					endpoint: schema.developerNotificationWebhooks.endpoint,
					secret: schema.developerNotificationWebhooks.secret,
				})
				.from(schema.developerNotificationWebhooks)
				.where(
					and(
						eq(schema.developerNotificationWebhooks.userId, user.id),
						eq(schema.developerNotificationWebhooks.isActive, true),
					),
				);

			const results =
				webhooks.length > 0
					? await deliverStoredNotificationWebhooks({
							db,
							webhooks,
							payload: snapshot,
						})
					: [];

			return c.json({
				deliveredAt: snapshot.generatedAt,
				unreadCount: snapshot.unreadCount,
				itemCount: snapshot.items.length,
				results,
			});
		},
	)
	.get(
		"/v1/notifications/:notificationId",
		zValidator("param", notificationIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { notificationId } = c.req.valid("param");
			const notification = await loadNotificationItemById({
				db: c.get("db"),
				publicUrl: c.get("r2").publicUrl,
				recipientUserId: user.id,
				notificationId,
			});

			if (!notification) {
				throw new HTTPException(404, { message: "Notification not found" });
			}

			return c.json({ notification });
		},
	);

export default app;

type DeveloperApiAuthUser = {
	id: string;
	name: string;
	handle: string | null;
	email: string;
};

const getDeveloperApiUserOrThrow = async (c: {
	req: {
		header: (name: string) => string | undefined;
	};
	get: (key: "db") => Database;
}) => {
	const authorization = c.req.header("authorization")?.trim() ?? "";
	const matched = authorization.match(/^Bearer\s+(.+)$/iu);
	const plainToken = matched?.[1]?.trim();

	if (!plainToken) {
		throw new HTTPException(401, { message: "Bearer token required" });
	}

	const tokenHash = hashDeveloperApiToken(plainToken);
	const now = new Date();
	const db = c.get("db");
	const [record] = await db
		.select({
			tokenId: schema.developerApiTokens.id,
			tokenExpiresAt: schema.developerApiTokens.expiresAt,
			tokenRevokedAt: schema.developerApiTokens.revokedAt,
			userId: schema.user.id,
			userName: schema.user.name,
			userHandle: schema.user.handle,
			userEmail: schema.user.email,
			userIsDeveloper: schema.user.isDeveloper,
			userIsBanned: schema.user.isBanned,
		})
		.from(schema.developerApiTokens)
		.innerJoin(
			schema.user,
			eq(schema.developerApiTokens.userId, schema.user.id),
		)
		.where(eq(schema.developerApiTokens.tokenHash, tokenHash))
		.limit(1);

	if (!record || !record.userIsDeveloper) {
		throw new HTTPException(401, { message: "Invalid developer API token" });
	}

	if (record.userIsBanned) {
		throw new HTTPException(403, { message: "Forbidden" });
	}

	if (
		record.tokenRevokedAt ||
		(record.tokenExpiresAt !== null && record.tokenExpiresAt <= now)
	) {
		throw new HTTPException(401, { message: "Invalid developer API token" });
	}

	await db
		.update(schema.developerApiTokens)
		.set({
			lastUsedAt: now,
			updatedAt: now,
		})
		.where(eq(schema.developerApiTokens.id, record.tokenId));

	const user: DeveloperApiAuthUser = {
		id: record.userId,
		name: record.userName,
		handle: record.userHandle,
		email: record.userEmail,
	};

	return user;
};

const buildDeveloperProfile = async (db: Database, userId: string) => {
	const [targetUser] = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			handle: schema.user.handle,
			bio: schema.user.bio,
			image: schema.user.image,
			bannerImage: schema.user.bannerImage,
			isDeveloper: schema.user.isDeveloper,
			createdAt: schema.user.createdAt,
			updatedAt: schema.user.updatedAt,
		})
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.limit(1);

	if (!targetUser) {
		throw new HTTPException(404, { message: "User not found" });
	}

	const [followersRows, followingRows, postsRows] = await Promise.all([
		db
			.select({ count: count() })
			.from(schema.follows)
			.where(eq(schema.follows.followingId, userId)),
		db
			.select({ count: count() })
			.from(schema.follows)
			.where(eq(schema.follows.followerId, userId)),
		db
			.select({ count: count() })
			.from(schema.posts)
			.where(eq(schema.posts.authorId, userId)),
	]);

	return {
		id: targetUser.id,
		name: targetUser.name,
		handle: targetUser.handle,
		bio: targetUser.bio,
		image: targetUser.image,
		bannerImage: targetUser.bannerImage,
		isDeveloper: targetUser.isDeveloper,
		createdAt: targetUser.createdAt.toISOString(),
		updatedAt: targetUser.updatedAt.toISOString(),
		stats: {
			followers: Number(followersRows[0]?.count ?? 0),
			following: Number(followingRows[0]?.count ?? 0),
			posts: Number(postsRows[0]?.count ?? 0),
		},
	};
};

const parseDeveloperPostFormData = (formData: FormData) => {
	const contentValue = formData.get("content");
	const content =
		typeof contentValue === "string" ? contentValue.trim() || null : null;

	if (content && countPostContentLength(content) > MAX_POST_CONTENT_LENGTH) {
		throw new ValidationError(
			`Post content must be ${MAX_POST_CONTENT_LENGTH} characters or fewer`,
		);
	}

	const replyToPostId = toOptionalText(formData.get("replyToPostId"));
	const quotePostId = toOptionalText(formData.get("quotePostId"));
	if (replyToPostId && quotePostId) {
		throw new ValidationError(
			"replyToPostId and quotePostId cannot be set together",
		);
	}

	const links = content ? extractUniquePostLinks(content) : [];
	const images = formData
		.getAll("images")
		.filter(
			(value): value is File =>
				typeof value !== "string" &&
				typeof value.size === "number" &&
				value.size > 0,
		);

	if (images.length > DEVELOPER_API_POST_LIMITS.maxImages) {
		throw new ValidationError(
			`You can upload up to ${DEVELOPER_API_POST_LIMITS.maxImages} images per post`,
		);
	}

	for (const image of images) {
		if (!DEVELOPER_API_ALLOWED_IMAGE_MIME_TYPE_SET.has(image.type)) {
			throw new ValidationError(
				`Only ${DEVELOPER_API_POST_LIMITS.allowedImageMimeTypes.join(", ")} files are supported`,
			);
		}

		if (image.size > DEVELOPER_API_POST_LIMITS.maxImageSizeBytes) {
			throw new ValidationError(
				`Each image must be ${formatBytes(
					DEVELOPER_API_POST_LIMITS.maxImageSizeBytes,
				)} or smaller`,
			);
		}
	}

	if (!content && images.length === 0) {
		throw new ValidationError("Post requires text or at least one image");
	}

	return {
		content,
		links,
		images,
		replyToPostId,
		quotePostId,
	};
};

const createPostWithImages = async (params: {
	db: Database;
	fileRepository: ReturnType<typeof createFileRepository>;
	bucketName: string;
	publicUrl: string;
	authorId: string;
	content: string | null;
	links: PostLink[];
	images: File[];
	replyToPostId?: string | null;
	quotePostId?: string | null;
}) => {
	const {
		db,
		fileRepository,
		bucketName,
		publicUrl,
		authorId,
		content,
		links,
		images,
		replyToPostId,
		quotePostId,
	} = params;

	const postId = uuidv7();
	const uploadedFileIds: string[] = [];

	try {
		await db.insert(schema.posts).values({
			id: postId,
			authorId,
			content,
			replyToPostId: replyToPostId ?? null,
			quotePostId: quotePostId ?? null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		for (const link of links) {
			const [savedLink] = await db
				.insert(schema.links)
				.values({
					id: uuidv7(),
					normalizedUrl: link.normalizedUrl,
					host: link.host,
					displayUrl: link.displayUrl,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: schema.links.normalizedUrl,
					set: {
						host: link.host,
						displayUrl: link.displayUrl,
						updatedAt: new Date(),
					},
				})
				.returning({
					id: schema.links.id,
				});

			if (!savedLink) {
				throw new Error("Failed to upsert link record");
			}

			await db.insert(schema.postLinks).values({
				id: uuidv7(),
				postId,
				linkId: savedLink.id,
				position: link.position,
				createdAt: new Date(),
			});
		}

		for (const [index, image] of images.entries()) {
			const uploaded = await fileRepository.saveBlobFile(
				createBlobFile({
					blob: image,
					bucket: bucketName,
					keyPrefix: `developer-api/posts/${authorId}/${postId}`,
					contentType: image.type || "application/octet-stream",
				}),
			);
			uploadedFileIds.push(uploaded.id);

			await db.insert(schema.postImages).values({
				id: uuidv7(),
				postId,
				fileId: uploaded.id,
				position: index,
				createdAt: new Date(),
			});
		}
	} catch (error) {
		await Promise.all(
			uploadedFileIds.map((fileId) =>
				fileRepository.deleteFileById(fileId).catch(() => undefined),
			),
		);
		await db.delete(schema.posts).where(eq(schema.posts.id, postId));
		throw error;
	}

	const postMap = await loadPostSummaryMap({
		db,
		publicUrl,
		postIds: [postId],
		viewerId: authorId,
	});
	const post = postMap.get(postId);
	if (!post) {
		throw new Error("Failed to build created post");
	}

	return post;
};

const toDeveloperApiTokenSummary = (token: {
	id: string;
	name: string;
	tokenPrefix: string;
	createdAt: Date;
	expiresAt: Date | null;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
}) => {
	return {
		id: token.id,
		name: token.name,
		tokenPrefix: token.tokenPrefix,
		createdAt: token.createdAt.toISOString(),
		expiresAt: token.expiresAt?.toISOString() ?? null,
		lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
		revokedAt: token.revokedAt?.toISOString() ?? null,
	};
};

const toDeveloperNotificationWebhookSummary = (webhook: {
	id: string;
	name: string;
	endpoint: string;
	isActive: boolean;
	lastSentAt: Date | null;
	lastStatusCode: number | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
}) => {
	return {
		id: webhook.id,
		name: webhook.name,
		endpoint: webhook.endpoint,
		isActive: webhook.isActive,
		lastSentAt: webhook.lastSentAt?.toISOString() ?? null,
		lastStatusCode: webhook.lastStatusCode,
		lastError: webhook.lastError,
		createdAt: webhook.createdAt.toISOString(),
		updatedAt: webhook.updatedAt.toISOString(),
	};
};

const validateName = (value: string) => {
	const normalized = value.trim();
	if (!normalized) {
		throw new ValidationError("Name is required");
	}
	if (normalized.length > MAX_PROFILE_NAME_LENGTH) {
		throw new ValidationError(
			`Name must be ${MAX_PROFILE_NAME_LENGTH} characters or fewer`,
		);
	}

	return normalized;
};

const validateBio = (value: string | null) => {
	if (value === null) {
		return null;
	}

	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	if (normalized.length > MAX_PROFILE_BIO_LENGTH) {
		throw new ValidationError(
			`Bio must be ${MAX_PROFILE_BIO_LENGTH} characters or fewer`,
		);
	}

	return normalized;
};

const validateHandle = async (
	db: Database,
	userId: string,
	value: string | null,
) => {
	if (value === null) {
		return null;
	}

	const normalized = normalizeUserHandle(value);
	if (!normalized) {
		return null;
	}

	if (!isValidUserHandle(normalized)) {
		throw new ValidationError(
			`Handle must use a-z, 0-9, _ and be ${MAX_HANDLE_LENGTH} characters or fewer`,
		);
	}

	const [existingUser] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(and(eq(schema.user.handle, normalized), ne(schema.user.id, userId)))
		.limit(1);

	if (existingUser) {
		throw new ValidationError("Handle is already taken");
	}

	return normalized;
};

const createDeveloperApiTokenPlaintext = () => {
	const randomPart = randomBytes(DEVELOPER_API_TOKEN_RANDOM_BYTES).toString(
		"base64url",
	);
	return `${DEVELOPER_API_TOKEN_PREFIX}${randomPart}`;
};

const createTokenPrefix = (plainToken: string) => {
	return plainToken.slice(0, DEVELOPER_API_TOKEN_PREFIX_LENGTH);
};

const createDeveloperNotificationWebhookSecret = () => {
	const randomPart = randomBytes(
		DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_RANDOM_BYTES,
	).toString("base64url");
	return `${DEVELOPER_NOTIFICATION_WEBHOOK_SECRET_PREFIX}${randomPart}`;
};

const hashDeveloperApiToken = (plainToken: string) => {
	return createHash("sha256").update(plainToken).digest("hex");
};

const toOptionalText = (value: FormDataEntryValue | null) => {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized || null;
};

const formatBytes = (value: number) => {
	const inMb = value / (1024 * 1024);
	if (Number.isInteger(inMb)) {
		return `${inMb}MB`;
	}

	return `${inMb.toFixed(1)}MB`;
};
