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

const developerApiTokenSelection = {
	id: schema.developerApiTokens.id,
	name: schema.developerApiTokens.name,
	tokenPrefix: schema.developerApiTokens.tokenPrefix,
	createdAt: schema.developerApiTokens.createdAt,
	expiresAt: schema.developerApiTokens.expiresAt,
	lastUsedAt: schema.developerApiTokens.lastUsedAt,
	revokedAt: schema.developerApiTokens.revokedAt,
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

		if (payload.replyToPostId) {
			await assertPostExists(db, payload.replyToPostId);
		}
		if (payload.quotePostId) {
			await assertPostExists(db, payload.quotePostId);
		}

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
			await assertPostExists(c.get("db"), postId);

			await c
				.get("db")
				.insert(schema.postLikes)
				.values({
					id: uuidv7(),
					postId,
					userId: user.id,
				})
				.onConflictDoNothing({
					target: [schema.postLikes.postId, schema.postLikes.userId],
				});

			const summary = await getPostInteractionSummary(
				c.get("db"),
				postId,
				user.id,
			);
			return c.json(summary);
		},
	)
	.delete(
		"/v1/posts/:postId/likes",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");

			await c
				.get("db")
				.delete(schema.postLikes)
				.where(
					and(
						eq(schema.postLikes.postId, postId),
						eq(schema.postLikes.userId, user.id),
					),
				);

			const summary = await getPostInteractionSummary(
				c.get("db"),
				postId,
				user.id,
			);
			return c.json(summary);
		},
	)
	.post(
		"/v1/posts/:postId/reposts",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");
			await assertPostExists(c.get("db"), postId);

			await c
				.get("db")
				.insert(schema.postReposts)
				.values({
					id: uuidv7(),
					postId,
					userId: user.id,
				})
				.onConflictDoNothing({
					target: [schema.postReposts.postId, schema.postReposts.userId],
				});

			const summary = await getPostInteractionSummary(
				c.get("db"),
				postId,
				user.id,
			);
			return c.json(summary);
		},
	)
	.delete(
		"/v1/posts/:postId/reposts",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const user = await getDeveloperApiUserOrThrow(c);
			const { postId } = c.req.valid("param");

			await c
				.get("db")
				.delete(schema.postReposts)
				.where(
					and(
						eq(schema.postReposts.postId, postId),
						eq(schema.postReposts.userId, user.id),
					),
				);

			const summary = await getPostInteractionSummary(
				c.get("db"),
				postId,
				user.id,
			);
			return c.json(summary);
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

const assertPostExists = async (db: Database, postId: string) => {
	const [post] = await db
		.select({ id: schema.posts.id })
		.from(schema.posts)
		.where(eq(schema.posts.id, postId))
		.limit(1);

	if (!post) {
		throw new HTTPException(404, { message: "Post not found" });
	}
};

const getPostInteractionSummary = async (
	db: Database,
	postId: string,
	viewerId: string,
) => {
	const [likesCountRows, repostsCountRows, likedRows, repostedRows] =
		await Promise.all([
			db
				.select({ count: count() })
				.from(schema.postLikes)
				.where(eq(schema.postLikes.postId, postId)),
			db
				.select({ count: count() })
				.from(schema.postReposts)
				.where(eq(schema.postReposts.postId, postId)),
			db
				.select({ postId: schema.postLikes.postId })
				.from(schema.postLikes)
				.where(
					and(
						eq(schema.postLikes.postId, postId),
						eq(schema.postLikes.userId, viewerId),
					),
				)
				.limit(1),
			db
				.select({ postId: schema.postReposts.postId })
				.from(schema.postReposts)
				.where(
					and(
						eq(schema.postReposts.postId, postId),
						eq(schema.postReposts.userId, viewerId),
					),
				)
				.limit(1),
		]);

	return {
		postId,
		liked: likedRows.length > 0,
		reposted: repostedRows.length > 0,
		likes: Number(likesCountRows[0]?.count ?? 0),
		reposts: Number(repostsCountRows[0]?.count ?? 0),
	};
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
