import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import {
	isValidUserHandle,
	MAX_HANDLE_LENGTH,
	normalizeUserHandle,
} from "@/lib/user-handle";
import { ValidationError } from "@/server/errors";
import { createFileRepository } from "@/server/infrastructure/repositories/file";
import { getUserOrThrow } from "@/server/middleware/auth";
import { createBlobFile } from "@/server/objects/file";
import { createHonoApp } from "../create-app";
import { dispatchNotificationWebhooksForRecipient } from "./shared/notification-webhooks";

const userIdParamSchema = z.object({
	userId: z.string().min(1),
});

const MAX_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 160;

type UserSummary = {
	id: string;
	name: string;
	handle: string | null;
	image: string | null;
	bio: string | null;
	bannerImage: string | null;
};

const app = createHonoApp()
	.get("/me", async (c) => {
		const { user } = await getUserOrThrow(c);
		const profile = await buildProfileResponse(c.get("db"), user.id, user.id);
		return c.json(profile);
	})
	.patch("/me", async (c) => {
		const { user } = await getUserOrThrow(c);
		const db = c.get("db");
		const { client, baseUrl, bucketName, publicUrl } = c.get("r2");
		const fileRepository = createFileRepository(client, db, baseUrl);

		const [currentUser] = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				handle: schema.user.handle,
				image: schema.user.image,
				bio: schema.user.bio,
				bannerImage: schema.user.bannerImage,
				avatarFileId: schema.user.avatarFileId,
				bannerFileId: schema.user.bannerFileId,
				createdAt: schema.user.createdAt,
				updatedAt: schema.user.updatedAt,
			})
			.from(schema.user)
			.where(eq(schema.user.id, user.id))
			.limit(1);

		if (!currentUser) {
			throw new HTTPException(404, { message: "User not found" });
		}

		const formData = await c.req.formData();

		const nameInput = formData.get("name");
		const handleInput = formData.get("handle");
		const bioInput = formData.get("bio");

		const nextName =
			typeof nameInput === "string"
				? validateName(nameInput)
				: currentUser.name;
		const nextHandle =
			typeof handleInput === "string"
				? await validateHandle(db, user.id, handleInput)
				: currentUser.handle;
		const nextBio =
			typeof bioInput === "string" ? validateBio(bioInput) : currentUser.bio;

		const avatarFile = getImageFileFromForm(formData, "avatar");
		const bannerFile = getImageFileFromForm(formData, "banner");

		const removeAvatar = formData.get("removeAvatar") === "true" && !avatarFile;
		const removeBanner = formData.get("removeBanner") === "true" && !bannerFile;

		const uploadedFileIds: string[] = [];
		let nextAvatarFileId = currentUser.avatarFileId;
		let nextBannerFileId = currentUser.bannerFileId;
		let nextAvatarUrl = currentUser.image;
		let nextBannerUrl = currentUser.bannerImage;

		try {
			if (avatarFile) {
				const uploadedAvatar = await fileRepository.saveBlobFile(
					createBlobFile({
						blob: avatarFile,
						bucket: bucketName,
						keyPrefix: `users/${user.id}/avatar`,
						contentType: avatarFile.type || "application/octet-stream",
					}),
				);
				uploadedFileIds.push(uploadedAvatar.id);
				nextAvatarFileId = uploadedAvatar.id;
				nextAvatarUrl = createPublicFileUrl(publicUrl, uploadedAvatar.key);
			} else if (removeAvatar) {
				nextAvatarFileId = null;
				nextAvatarUrl = null;
			}

			if (bannerFile) {
				const uploadedBanner = await fileRepository.saveBlobFile(
					createBlobFile({
						blob: bannerFile,
						bucket: bucketName,
						keyPrefix: `users/${user.id}/banner`,
						contentType: bannerFile.type || "application/octet-stream",
					}),
				);
				uploadedFileIds.push(uploadedBanner.id);
				nextBannerFileId = uploadedBanner.id;
				nextBannerUrl = createPublicFileUrl(publicUrl, uploadedBanner.key);
			} else if (removeBanner) {
				nextBannerFileId = null;
				nextBannerUrl = null;
			}

			await db
				.update(schema.user)
				.set({
					name: nextName,
					handle: nextHandle,
					bio: nextBio,
					image: nextAvatarUrl,
					bannerImage: nextBannerUrl,
					avatarFileId: nextAvatarFileId,
					bannerFileId: nextBannerFileId,
					updatedAt: new Date(),
				})
				.where(eq(schema.user.id, user.id));
		} catch (error) {
			await Promise.all(
				uploadedFileIds.map((fileId) =>
					fileRepository.deleteFileById(fileId).catch(() => undefined),
				),
			);
			throw error;
		}

		const deleteTargetIds = [
			avatarFile && currentUser.avatarFileId ? currentUser.avatarFileId : null,
			removeAvatar ? currentUser.avatarFileId : null,
			bannerFile && currentUser.bannerFileId ? currentUser.bannerFileId : null,
			removeBanner ? currentUser.bannerFileId : null,
		].filter((fileId): fileId is string => Boolean(fileId));

		await Promise.all(
			[...new Set(deleteTargetIds)].map((fileId) =>
				fileRepository.deleteFileById(fileId).catch(() => undefined),
			),
		);

		const profile = await buildProfileResponse(db, user.id, user.id);
		return c.json(profile);
	})
	.post("/me/developer", async (c) => {
		const { user } = await getUserOrThrow(c);
		await c
			.get("db")
			.update(schema.user)
			.set({
				isDeveloper: true,
				updatedAt: new Date(),
			})
			.where(eq(schema.user.id, user.id));

		return c.json({ isDeveloper: true });
	})
	.get("/:userId", zValidator("param", userIdParamSchema), async (c) => {
		const { userId } = c.req.valid("param");
		const viewer = c.get("user");
		const profile = await buildProfileResponse(
			c.get("db"),
			userId,
			viewer?.id ?? null,
		);
		return c.json(profile);
	})
	.get(
		"/:userId/followers",
		zValidator("param", userIdParamSchema),
		async (c) => {
			const { userId } = c.req.valid("param");
			await assertUserExists(c.get("db"), userId);

			const rows = await c
				.get("db")
				.select({
					id: schema.user.id,
					name: schema.user.name,
					handle: schema.user.handle,
					image: schema.user.image,
					bio: schema.user.bio,
					bannerImage: schema.user.bannerImage,
				})
				.from(schema.follows)
				.innerJoin(schema.user, eq(schema.follows.followerId, schema.user.id))
				.where(eq(schema.follows.followingId, userId))
				.orderBy(desc(schema.follows.createdAt));

			const users: UserSummary[] = rows.map((row) => ({
				id: row.id,
				name: row.name,
				handle: row.handle,
				image: row.image,
				bio: row.bio,
				bannerImage: row.bannerImage,
			}));

			return c.json({ users });
		},
	)
	.get(
		"/:userId/following",
		zValidator("param", userIdParamSchema),
		async (c) => {
			const { userId } = c.req.valid("param");
			await assertUserExists(c.get("db"), userId);

			const rows = await c
				.get("db")
				.select({
					id: schema.user.id,
					name: schema.user.name,
					handle: schema.user.handle,
					image: schema.user.image,
					bio: schema.user.bio,
					bannerImage: schema.user.bannerImage,
				})
				.from(schema.follows)
				.innerJoin(schema.user, eq(schema.follows.followingId, schema.user.id))
				.where(eq(schema.follows.followerId, userId))
				.orderBy(desc(schema.follows.createdAt));

			const users: UserSummary[] = rows.map((row) => ({
				id: row.id,
				name: row.name,
				handle: row.handle,
				image: row.image,
				bio: row.bio,
				bannerImage: row.bannerImage,
			}));

			return c.json({ users });
		},
	)
	.post(
		"/:userId/follow",
		zValidator("param", userIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { userId } = c.req.valid("param");
			const db = c.get("db");

			if (user.id === userId) {
				throw new ValidationError("You cannot follow yourself");
			}

			await assertUserExists(db, userId);

			const [savedFollow] = await db
				.insert(schema.follows)
				.values({
					id: uuidv7(),
					followerId: user.id,
					followingId: userId,
					createdAt: new Date(),
				})
				.onConflictDoNothing({
					target: [schema.follows.followerId, schema.follows.followingId],
				})
				.returning({
					id: schema.follows.id,
				});

			if (savedFollow) {
				const [savedNotification] = await db
					.insert(schema.notifications)
					.values({
						id: uuidv7(),
						recipientUserId: userId,
						actorUserId: user.id,
						type: "follow",
						sourceType: "follow",
						sourceId: savedFollow.id,
						actionUrl: `/users/${user.id}`,
						createdAt: new Date(),
					})
					.onConflictDoNothing({
						target: [
							schema.notifications.sourceType,
							schema.notifications.sourceId,
						],
					})
					.returning({
						id: schema.notifications.id,
					});

				if (savedNotification) {
					await dispatchNotificationWebhooksForRecipient({
						db,
						publicUrl: c.get("r2").publicUrl,
						recipientUserId: userId,
						trigger: {
							notificationId: savedNotification.id,
							type: "follow",
							sourceType: "follow",
							sourceId: savedFollow.id,
						},
					}).catch(() => undefined);
				}
			}

			const profile = await buildProfileResponse(db, userId, user.id);
			return c.json(profile);
		},
	)
	.delete(
		"/:userId/follow",
		zValidator("param", userIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { userId } = c.req.valid("param");
			const db = c.get("db");

			const deletedFollows = await db
				.delete(schema.follows)
				.where(
					and(
						eq(schema.follows.followerId, user.id),
						eq(schema.follows.followingId, userId),
					),
				)
				.returning({
					id: schema.follows.id,
				});

			if (deletedFollows.length > 0) {
				await db.delete(schema.notifications).where(
					and(
						eq(schema.notifications.sourceType, "follow"),
						inArray(
							schema.notifications.sourceId,
							deletedFollows.map((follow) => follow.id),
						),
					),
				);
			}

			const profile = await buildProfileResponse(db, userId, user.id);
			return c.json(profile);
		},
	);

export default app;

const validateName = (value: string) => {
	const normalized = value.trim();
	if (!normalized) {
		throw new ValidationError("Name is required");
	}
	if (normalized.length > MAX_NAME_LENGTH) {
		throw new ValidationError(
			`Name must be ${MAX_NAME_LENGTH} characters or fewer`,
		);
	}
	return normalized;
};

const validateBio = (value: string) => {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	if (normalized.length > MAX_BIO_LENGTH) {
		throw new ValidationError(
			`Bio must be ${MAX_BIO_LENGTH} characters or fewer`,
		);
	}
	return normalized;
};

const validateHandle = async (db: Database, userId: string, value: string) => {
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

const getImageFileFromForm = (formData: FormData, key: string) => {
	const value = formData.get(key);
	if (typeof value === "string" || !value || value.size === 0) {
		return null;
	}
	if (!value.type.startsWith("image/")) {
		throw new ValidationError("Only image files are supported");
	}
	return value;
};

const createPublicFileUrl = (baseUrl: string, key: string) => {
	const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
	return new URL(key, normalizedBaseUrl).toString();
};

const assertUserExists = async (db: Database, userId: string) => {
	const [target] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(eq(schema.user.id, userId))
		.limit(1);

	if (!target) {
		throw new HTTPException(404, { message: "User not found" });
	}
};

const buildProfileResponse = async (
	db: Database,
	targetUserId: string,
	viewerId: string | null,
) => {
	const [targetUser] = await db
		.select({
			id: schema.user.id,
			name: schema.user.name,
			handle: schema.user.handle,
			image: schema.user.image,
			bio: schema.user.bio,
			bannerImage: schema.user.bannerImage,
			createdAt: schema.user.createdAt,
			updatedAt: schema.user.updatedAt,
		})
		.from(schema.user)
		.where(eq(schema.user.id, targetUserId))
		.limit(1);

	if (!targetUser) {
		throw new HTTPException(404, { message: "User not found" });
	}

	const [followersRows, followingRows, postsRows, followingStateRows] =
		await Promise.all([
			db
				.select({ count: count() })
				.from(schema.follows)
				.where(eq(schema.follows.followingId, targetUserId)),
			db
				.select({ count: count() })
				.from(schema.follows)
				.where(eq(schema.follows.followerId, targetUserId)),
			db
				.select({ count: count() })
				.from(schema.posts)
				.where(eq(schema.posts.authorId, targetUserId)),
			viewerId
				? db
						.select({ id: schema.follows.id })
						.from(schema.follows)
						.where(
							and(
								eq(schema.follows.followerId, viewerId),
								eq(schema.follows.followingId, targetUserId),
							),
						)
						.limit(1)
				: Promise.resolve([]),
		]);

	return {
		user: targetUser,
		stats: {
			followers: Number(followersRows[0]?.count ?? 0),
			following: Number(followingRows[0]?.count ?? 0),
			posts: Number(postsRows[0]?.count ?? 0),
		},
		viewer: {
			isSelf: viewerId === targetUserId,
			isFollowing: followingStateRows.length > 0,
		},
	};
};
