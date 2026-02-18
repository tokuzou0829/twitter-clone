import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq } from "drizzle-orm";
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
import { ValidationError } from "@/server/errors";
import { createFileRepository } from "@/server/infrastructure/repositories/file";
import { getUserOrThrow } from "@/server/middleware/auth";
import { createBlobFile } from "@/server/objects/file";
import { createHonoApp } from "../create-app";
import { loadPostSummaryMap, loadTimelineItems } from "./shared/social";

const timelineQuerySchema = z.object({
	userId: z.string().min(1).optional(),
	tab: z.enum(["posts", "replies", "media", "likes"]).optional(),
});

const postIdParamSchema = z.object({
	postId: z.string().min(1),
});

const MAX_POST_IMAGES = 4;
const MAX_TIMELINE_REPLIES = 80;

const app = createHonoApp()
	.get("/", zValidator("query", timelineQuerySchema), async (c) => {
		const { userId, tab } = c.req.valid("query");
		const viewer = c.get("user");
		const timeline = await loadTimelineItems({
			db: c.get("db"),
			publicUrl: c.get("r2").publicUrl,
			viewerId: viewer?.id ?? null,
			actorUserId: userId,
			tab,
		});

		return c.json({
			items: timeline,
		});
	})
	.get("/:postId", zValidator("param", postIdParamSchema), async (c) => {
		const { postId } = c.req.valid("param");
		const db = c.get("db");
		const viewerId = c.get("user")?.id ?? null;
		const publicUrl = c.get("r2").publicUrl;

		const postMap = await loadPostSummaryMap({
			db,
			publicUrl,
			postIds: [postId],
			viewerId,
		});
		const post = postMap.get(postId);
		if (!post) {
			throw new HTTPException(404, { message: "Post not found" });
		}

		const conversationPathIds = await loadConversationPathIds(db, postId);
		const conversationPathMap = await loadPostSummaryMap({
			db,
			publicUrl,
			postIds: conversationPathIds,
			viewerId,
		});
		const conversationPath = conversationPathIds
			.map((ancestorPostId) => conversationPathMap.get(ancestorPostId))
			.filter(
				(ancestor): ancestor is NonNullable<typeof ancestor> =>
					ancestor !== undefined,
			);

		const replyRows = await db
			.select({
				id: schema.posts.id,
			})
			.from(schema.posts)
			.where(eq(schema.posts.replyToPostId, postId))
			.orderBy(desc(schema.posts.createdAt))
			.limit(MAX_TIMELINE_REPLIES);

		const replyIds = replyRows.map((row) => row.id);
		const replyMap = await loadPostSummaryMap({
			db,
			publicUrl,
			postIds: replyIds,
			viewerId,
		});
		const replies = replyIds
			.map((replyId) => replyMap.get(replyId))
			.filter(
				(reply): reply is NonNullable<typeof reply> => reply !== undefined,
			);

		return c.json({
			post,
			conversationPath,
			replies,
		});
	})
	.post("/", async (c) => {
		const { user } = await getUserOrThrow(c);
		const formData = await c.req.formData();
		const payload = parsePostFormData(formData, { allowEmpty: false });

		const { client, baseUrl, bucketName, publicUrl } = c.get("r2");
		const fileRepository = createFileRepository(client, c.get("db"), baseUrl);
		const post = await createPostWithImages({
			db: c.get("db"),
			fileRepository,
			bucketName,
			publicUrl,
			authorId: user.id,
			content: payload.content,
			links: payload.links,
			images: payload.images,
		});

		return c.json({ post }, 201);
	})
	.post(
		"/:postId/replies",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { postId } = c.req.valid("param");
			await assertPostExists(c.get("db"), postId);

			const formData = await c.req.formData();
			const payload = parsePostFormData(formData, { allowEmpty: false });

			const { client, baseUrl, bucketName, publicUrl } = c.get("r2");
			const fileRepository = createFileRepository(client, c.get("db"), baseUrl);
			const post = await createPostWithImages({
				db: c.get("db"),
				fileRepository,
				bucketName,
				publicUrl,
				authorId: user.id,
				content: payload.content,
				links: payload.links,
				images: payload.images,
				replyToPostId: postId,
			});

			return c.json({ post }, 201);
		},
	)
	.post(
		"/:postId/quotes",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
			const { postId } = c.req.valid("param");
			await assertPostExists(c.get("db"), postId);

			const formData = await c.req.formData();
			const payload = parsePostFormData(formData, { allowEmpty: true });

			const { client, baseUrl, bucketName, publicUrl } = c.get("r2");
			const fileRepository = createFileRepository(client, c.get("db"), baseUrl);
			const post = await createPostWithImages({
				db: c.get("db"),
				fileRepository,
				bucketName,
				publicUrl,
				authorId: user.id,
				content: payload.content,
				links: payload.links,
				images: payload.images,
				quotePostId: postId,
			});

			return c.json({ post }, 201);
		},
	)
	.delete("/:postId", zValidator("param", postIdParamSchema), async (c) => {
		const { user } = await getUserOrThrow(c);
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

		const fileIds = [...new Set(imageRows.map((imageRow) => imageRow.fileId))];
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
	})
	.get("/:postId/likes", zValidator("param", postIdParamSchema), async (c) => {
		const { user } = await getUserOrThrow(c);
		const { postId } = c.req.valid("param");
		const db = c.get("db");

		const [post] = await db
			.select({
				id: schema.posts.id,
				authorId: schema.posts.authorId,
			})
			.from(schema.posts)
			.where(eq(schema.posts.id, postId))
			.limit(1);

		if (!post) {
			throw new HTTPException(404, { message: "Post not found" });
		}

		if (post.authorId !== user.id) {
			throw new HTTPException(403, {
				message: "Only the author can view likers",
			});
		}

		const rows = await db
			.select({
				id: schema.user.id,
				name: schema.user.name,
				handle: schema.user.handle,
				image: schema.user.image,
				bio: schema.user.bio,
				bannerImage: schema.user.bannerImage,
			})
			.from(schema.postLikes)
			.innerJoin(schema.user, eq(schema.postLikes.userId, schema.user.id))
			.where(eq(schema.postLikes.postId, postId))
			.orderBy(desc(schema.postLikes.createdAt));

		const users = rows.map((row) => ({
			id: row.id,
			name: row.name,
			handle: row.handle,
			image: row.image,
			bio: row.bio,
			bannerImage: row.bannerImage,
		}));

		return c.json({ users });
	})
	.post("/:postId/likes", zValidator("param", postIdParamSchema), async (c) => {
		const { user } = await getUserOrThrow(c);
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
	})
	.delete(
		"/:postId/likes",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
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
		"/:postId/reposts",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
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
		"/:postId/reposts",
		zValidator("param", postIdParamSchema),
		async (c) => {
			const { user } = await getUserOrThrow(c);
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

const parsePostFormData = (
	formData: FormData,
	options: { allowEmpty: boolean },
) => {
	const contentValue = formData.get("content");
	const content =
		typeof contentValue === "string" ? contentValue.trim() || null : null;

	if (content && countPostContentLength(content) > MAX_POST_CONTENT_LENGTH) {
		throw new ValidationError(
			`Post content must be ${MAX_POST_CONTENT_LENGTH} characters or fewer`,
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

	if (images.length > MAX_POST_IMAGES) {
		throw new ValidationError(`You can upload up to ${MAX_POST_IMAGES} images`);
	}

	for (const image of images) {
		if (!image.type.startsWith("image/")) {
			throw new ValidationError("Only image files are supported");
		}
	}

	if (!options.allowEmpty && !content && images.length === 0) {
		throw new ValidationError("Post requires text or at least one image");
	}

	return {
		content,
		links,
		images,
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
	replyToPostId?: string;
	quotePostId?: string;
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
					keyPrefix: `posts/${authorId}/${postId}`,
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

const loadConversationPathIds = async (db: Database, postId: string) => {
	const ancestors: string[] = [];
	const visited = new Set<string>();
	let cursorId: string | null = postId;

	while (cursorId) {
		if (visited.has(cursorId)) {
			break;
		}
		visited.add(cursorId);

		const [row] = await db
			.select({
				replyToPostId: schema.posts.replyToPostId,
			})
			.from(schema.posts)
			.where(eq(schema.posts.id, cursorId))
			.limit(1);

		if (!row?.replyToPostId) {
			break;
		}

		ancestors.push(row.replyToPostId);
		cursorId = row.replyToPostId;
	}

	return ancestors.reverse();
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
