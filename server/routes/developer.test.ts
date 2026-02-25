import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { BlobFile } from "@/server/objects/file";
import { setup } from "@/tests/vitest.helper";

const mocks = vi.hoisted(() => ({
	saveBlobFile: vi.fn(),
	deleteFileById: vi.fn(),
}));

vi.mock("../infrastructure/repositories/file", async () => {
	const actual = await vi.importActual<
		typeof import("../infrastructure/repositories/file")
	>("../infrastructure/repositories/file");
	return {
		...actual,
		createFileRepository: vi.fn(() => ({
			saveBlobFile: mocks.saveBlobFile,
			deleteFileById: mocks.deleteFileById,
		})),
	};
});

import app from "./developer";

const { createUser, db } = await setup();

beforeEach(() => {
	mocks.saveBlobFile.mockImplementation(async (file: BlobFile) => {
		await db.insert(schema.files).values({
			id: file.id,
			bucket: file.bucket,
			key: file.key,
			contentType: file.contentType,
			size: file.blob.size,
			uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
		});

		return {
			...file,
			size: file.blob.size,
			uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
		};
	});

	mocks.deleteFileById.mockImplementation(async (fileId: string) => {
		await db.delete(schema.files).where(eq(schema.files.id, fileId));
	});
});

describe("/routes/developer", () => {
	it("未ログイン時に /tokens は利用できない", async () => {
		const response = await app.request("/tokens", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("未ログイン時に /notification-webhooks は利用できない", async () => {
		const response = await app.request("/notification-webhooks", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("開発者ではないユーザーは /tokens 発行ができない", async () => {
		await createUser();

		const response = await app.request("/tokens", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "No Access",
			}),
		});

		expect(response.status).toBe(403);
	});

	it("開発者ではないユーザーは /notification-webhooks を取得できない", async () => {
		await createUser();

		const response = await app.request("/notification-webhooks", {
			method: "GET",
		});

		expect(response.status).toBe(403);
	});

	it("開発者はトークンを発行・一覧取得・失効できる", async () => {
		await createUser({ isDeveloper: true });

		const createResponse = await app.request("/tokens", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "CLI Token",
			}),
		});
		const created = (await createResponse.json()) as {
			token: { id: string; tokenPrefix: string };
			plainToken: string;
		};

		const listResponse = await app.request("/tokens", {
			method: "GET",
		});
		const listed = (await listResponse.json()) as {
			tokens: Array<{
				id: string;
				tokenPrefix: string;
				revokedAt: string | null;
			}>;
		};

		const revokeResponse = await app.request(`/tokens/${created.token.id}`, {
			method: "DELETE",
		});
		const revoked = (await revokeResponse.json()) as {
			token: { id: string; revokedAt: string | null };
		};

		expect(createResponse.status).toBe(201);
		expect(created.plainToken.startsWith("nmt_dev_")).toBe(true);
		expect(created.token.tokenPrefix.startsWith("nmt_dev_")).toBe(true);
		expect(listResponse.status).toBe(200);
		expect(listed.tokens.some((token) => token.id === created.token.id)).toBe(
			true,
		);
		expect(revokeResponse.status).toBe(200);
		expect(revoked.token.id).toBe(created.token.id);
		expect(revoked.token.revokedAt).not.toBeNull();
	});

	it("開発者はWebhook購読状況を一覧取得できる", async () => {
		await createUser({ isDeveloper: true });

		await db.insert(schema.developerNotificationWebhooks).values([
			{
				id: "developer_webhook_status_active",
				userId: "test_user_id",
				name: "Main Hook",
				endpoint: "https://hooks.example.com/main",
				secret: "whsec_main",
				isActive: true,
				lastSentAt: new Date("2026-01-03T00:00:00.000Z"),
				lastStatusCode: 200,
			},
			{
				id: "developer_webhook_status_inactive",
				userId: "test_user_id",
				name: "Backup Hook",
				endpoint: "https://hooks.example.com/backup",
				secret: "whsec_backup",
				isActive: false,
				lastError: "timeout",
			},
		]);

		const response = await app.request("/notification-webhooks", {
			method: "GET",
		});
		const body = (await response.json()) as {
			webhooks: Array<{
				id: string;
				name: string;
				endpoint: string;
				isActive: boolean;
				lastStatusCode: number | null;
				lastError: string | null;
			}>;
		};

		expect(response.status).toBe(200);
		expect(body.webhooks.length).toBe(2);
		const mainHook = body.webhooks.find(
			(webhook) => webhook.id === "developer_webhook_status_active",
		);
		const backupHook = body.webhooks.find(
			(webhook) => webhook.id === "developer_webhook_status_inactive",
		);

		expect(mainHook?.name).toBe("Main Hook");
		expect(mainHook?.isActive).toBe(true);
		expect(mainHook?.lastStatusCode).toBe(200);
		expect(backupHook?.name).toBe("Backup Hook");
		expect(backupHook?.isActive).toBe(false);
		expect(backupHook?.lastError).toBe("timeout");
	});

	it("開発者はセッション経由で通知Webhookを管理できる", async () => {
		await createUser({ isDeveloper: true });
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(null, { status: 204 }));

		const createResponse = await app.request("/notification-webhooks", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "Session Hook",
				endpoint: "https://hooks.example.com/session",
			}),
		});
		const created = (await createResponse.json()) as {
			webhook: { id: string; name: string; isActive: boolean };
			plainSecret: string;
		};

		const patchResponse = await app.request(
			`/notification-webhooks/${created.webhook.id}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: "Session Hook Updated",
					isActive: false,
				}),
			},
		);
		const patched = (await patchResponse.json()) as {
			webhook: { id: string; name: string; isActive: boolean };
			plainSecret: string | null;
		};

		const sendResponse = await app.request(
			`/notification-webhooks/${created.webhook.id}/send`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			},
		);
		const sent = (await sendResponse.json()) as {
			results: Array<{
				endpoint: string;
				status: string;
				statusCode: number | null;
			}>;
		};

		const listResponse = await app.request("/notification-webhooks", {
			method: "GET",
		});
		const listed = (await listResponse.json()) as {
			webhooks: Array<{
				id: string;
				name: string;
				isActive: boolean;
				lastSentAt: string | null;
				lastStatusCode: number | null;
			}>;
		};

		const deleteResponse = await app.request(
			`/notification-webhooks/${created.webhook.id}`,
			{
				method: "DELETE",
			},
		);

		expect(createResponse.status).toBe(201);
		expect(created.webhook.name).toBe("Session Hook");
		expect(created.webhook.isActive).toBe(true);
		expect(created.plainSecret.startsWith("nmt_whsec_")).toBe(true);
		expect(patchResponse.status).toBe(200);
		expect(patched.webhook.name).toBe("Session Hook Updated");
		expect(patched.webhook.isActive).toBe(false);
		expect(patched.plainSecret).toBeNull();
		expect(sendResponse.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(sent.results[0]?.endpoint).toBe("https://hooks.example.com/session");
		expect(sent.results[0]?.status).toBe("success");
		expect(sent.results[0]?.statusCode).toBe(204);
		expect(listResponse.status).toBe(200);
		const updatedHook = listed.webhooks.find(
			(webhook) => webhook.id === created.webhook.id,
		);
		expect(updatedHook?.name).toBe("Session Hook Updated");
		expect(updatedHook?.isActive).toBe(false);
		expect(updatedHook?.lastSentAt).not.toBeNull();
		expect(updatedHook?.lastStatusCode).toBe(204);
		expect(deleteResponse.status).toBe(200);

		fetchSpy.mockRestore();
	});

	it("開発者は無期限トークンを発行できる", async () => {
		await createUser({ isDeveloper: true });

		const createResponse = await app.request("/tokens", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "No Expiry",
				expiresInDays: null,
			}),
		});
		const created = (await createResponse.json()) as {
			token: { id: string; expiresAt: string | null };
			plainToken: string;
		};

		const profileResponse = await app.request("/v1/profile", {
			method: "GET",
			headers: {
				authorization: `Bearer ${created.plainToken}`,
			},
		});

		expect(createResponse.status).toBe(201);
		expect(created.token.expiresAt).toBeNull();
		expect(profileResponse.status).toBe(200);
	});

	it("Bearerトークンなしでは /v1/profile は利用できない", async () => {
		const response = await app.request("/v1/profile", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("Bearerトークンでプロフィール取得と更新ができる", async () => {
		const token = await createDeveloperApiToken();

		const profileResponse = await app.request("/v1/profile", {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});
		const profile = (await profileResponse.json()) as {
			profile: { id: string; name: string; handle: string | null };
		};

		const patchResponse = await app.request("/v1/profile", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				authorization: `Bearer ${token.plainToken}`,
			},
			body: JSON.stringify({
				name: "API Updated",
				handle: "api_updated",
				bio: "Updated from developer api",
			}),
		});
		const patched = (await patchResponse.json()) as {
			profile: { name: string; handle: string | null; bio: string | null };
		};

		expect(profileResponse.status).toBe(200);
		expect(profile.profile.id).toBe("test_user_id");
		expect(patchResponse.status).toBe(200);
		expect(patched.profile.name).toBe("API Updated");
		expect(patched.profile.handle).toBe("api_updated");
		expect(patched.profile.bio).toBe("Updated from developer api");
	});

	it("Bearerトークンで画像付き投稿を作成できる", async () => {
		const token = await createDeveloperApiToken();
		const formData = new FormData();
		formData.set("content", "developer api image post");
		formData.append(
			"images",
			new File(["dummy-image"], "sample.png", { type: "image/png" }),
		);

		const response = await app.request("/v1/posts", {
			method: "POST",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
			body: formData,
		});

		expect(response.status).toBe(201);
		expect(mocks.saveBlobFile).toHaveBeenCalledTimes(1);
	});

	it("Bearerトークンで投稿を単体取得できる", async () => {
		const token = await createDeveloperApiToken();
		const authorId = "developer_get_post_author";
		const postId = "developer_get_post_id";

		await db.insert(schema.user).values({
			id: authorId,
			name: "Developer Get Post Author",
			email: "developer-get-post-author@example.com",
			emailVerified: true,
		});

		await db.insert(schema.posts).values({
			id: postId,
			authorId,
			content: "developer api single post",
		});

		const response = await app.request(`/v1/posts/${postId}`, {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});
		const body = (await response.json()) as {
			post: {
				id: string;
				content: string | null;
				author: { id: string };
				viewer: {
					liked: boolean;
					reposted: boolean;
					followingAuthor: boolean;
				};
			};
		};

		expect(response.status).toBe(200);
		expect(body.post.id).toBe(postId);
		expect(body.post.content).toBe("developer api single post");
		expect(body.post.author.id).toBe(authorId);
		expect(body.post.viewer.liked).toBe(false);
		expect(body.post.viewer.reposted).toBe(false);
		expect(body.post.viewer.followingAuthor).toBe(false);
	});

	it("Bearerトークンで投稿スレッドを既存互換形式で取得できる", async () => {
		const token = await createDeveloperApiToken();
		const authorId = "developer_get_thread_author";
		const rootPostId = "developer_get_thread_root";
		const parentPostId = "developer_get_thread_parent";
		const targetPostId = "developer_get_thread_target";
		const directReplyPostId = "developer_get_thread_direct_reply";
		const nestedReplyPostId = "developer_get_thread_nested_reply";

		await db.insert(schema.user).values({
			id: authorId,
			name: "Developer Thread Author",
			email: "developer-thread-author@example.com",
			emailVerified: true,
		});

		await db.insert(schema.posts).values([
			{
				id: rootPostId,
				authorId,
				content: "thread root",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: parentPostId,
				authorId,
				content: "thread parent",
				replyToPostId: rootPostId,
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
				updatedAt: new Date("2026-01-02T00:00:00.000Z"),
			},
			{
				id: targetPostId,
				authorId,
				content: "thread target",
				replyToPostId: parentPostId,
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
				updatedAt: new Date("2026-01-03T00:00:00.000Z"),
			},
			{
				id: directReplyPostId,
				authorId,
				content: "direct reply",
				replyToPostId: targetPostId,
				createdAt: new Date("2026-01-04T00:00:00.000Z"),
				updatedAt: new Date("2026-01-04T00:00:00.000Z"),
			},
			{
				id: nestedReplyPostId,
				authorId,
				content: "nested reply",
				replyToPostId: directReplyPostId,
				createdAt: new Date("2026-01-05T00:00:00.000Z"),
				updatedAt: new Date("2026-01-05T00:00:00.000Z"),
			},
		]);

		const response = await app.request(`/v1/posts/${targetPostId}/thread`, {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});
		const body = (await response.json()) as {
			post: {
				id: string;
				replyToPostId: string | null;
			};
			conversationPath: Array<{ id: string }>;
			replies: Array<{
				id: string;
				replyToPostId: string | null;
				stats: { replies: number };
			}>;
		};

		expect(response.status).toBe(200);
		expect(body.post.id).toBe(targetPostId);
		expect(body.post.replyToPostId).toBe(parentPostId);
		expect(body.conversationPath.map((post) => post.id)).toEqual([
			rootPostId,
			parentPostId,
		]);
		expect(body.replies.length).toBe(1);
		expect(body.replies[0]?.id).toBe(directReplyPostId);
		expect(body.replies[0]?.replyToPostId).toBe(targetPostId);
		expect(body.replies[0]?.stats.replies).toBe(1);
	});

	it("存在しない投稿のDeveloper API取得は404", async () => {
		const token = await createDeveloperApiToken();

		const singleResponse = await app.request("/v1/posts/unknown_post_id", {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});

		const threadResponse = await app.request(
			"/v1/posts/unknown_post_id/thread",
			{
				method: "GET",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);

		expect(singleResponse.status).toBe(404);
		expect(threadResponse.status).toBe(404);
	});

	it("画像枚数制限を超えた投稿は拒否される", async () => {
		const token = await createDeveloperApiToken();
		const formData = new FormData();
		formData.set("content", "too many images");
		for (let index = 0; index < 3; index += 1) {
			formData.append(
				"images",
				new File([`image-${index}`], `img-${index}.png`, { type: "image/png" }),
			);
		}

		const response = await app.request("/v1/posts", {
			method: "POST",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
			body: formData,
		});

		expect(response.status).toBe(400);
	});

	it("Bearerトークン投稿のメンションはuserIdで保存され通知される", async () => {
		const token = await createDeveloperApiToken();
		const mentionedUserId = "developer_mention_target_user";
		const mentionedHandle = "dev_mention";

		await db.insert(schema.user).values({
			id: mentionedUserId,
			name: "Developer Mention Target",
			handle: mentionedHandle,
			email: "developer-mention-target@example.com",
			emailVerified: true,
		});

		const formData = new FormData();
		formData.set("content", `hello @${mentionedHandle}`);

		const response = await app.request("/v1/posts", {
			method: "POST",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
			body: formData,
		});
		const body = (await response.json()) as {
			post: {
				id: string;
				mentions: Array<{ user: { id: string } }>;
			};
		};

		const [savedMention] = await db
			.select({
				mentionedUserId: schema.postMentions.mentionedUserId,
			})
			.from(schema.postMentions)
			.where(eq(schema.postMentions.postId, body.post.id))
			.limit(1);

		const [savedNotification] = await db
			.select({
				type: schema.notifications.type,
				sourceType: schema.notifications.sourceType,
				sourceId: schema.notifications.sourceId,
				postId: schema.notifications.postId,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.recipientUserId, mentionedUserId),
					eq(schema.notifications.actorUserId, "test_user_id"),
					eq(schema.notifications.type, "mention"),
				),
			)
			.limit(1);

		expect(response.status).toBe(201);
		expect(savedMention?.mentionedUserId).toBe(mentionedUserId);
		expect(body.post.mentions[0]?.user.id).toBe(mentionedUserId);
		expect(savedNotification?.type).toBe("mention");
		expect(savedNotification?.postId).toBe(body.post.id);
		expect(savedNotification?.sourceType).toBe("post_mention");
		expect(savedNotification?.sourceId).toBe(
			`${body.post.id}:${mentionedUserId}`,
		);
	});

	it("いいねとリポストをBearerトークンで切り替えでき、通知も同期される", async () => {
		const token = await createDeveloperApiToken();

		await db.insert(schema.user).values({
			id: "developer_route_target_author",
			name: "Target Author",
			email: "developer-route-target-author@example.com",
			emailVerified: true,
		});
		await db.insert(schema.posts).values({
			id: "developer_route_target_post",
			authorId: "developer_route_target_author",
			content: "target",
		});

		const likeResponse = await app.request(
			"/v1/posts/developer_route_target_post/likes",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);
		const liked = (await likeResponse.json()) as {
			liked: boolean;
			likes: number;
		};
		const [savedLikeNotification] = await db
			.select({
				id: schema.notifications.id,
				type: schema.notifications.type,
				sourceType: schema.notifications.sourceType,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(
						schema.notifications.recipientUserId,
						"developer_route_target_author",
					),
					eq(schema.notifications.actorUserId, "test_user_id"),
					eq(schema.notifications.type, "like"),
					eq(schema.notifications.sourceType, "post_like"),
					eq(schema.notifications.postId, "developer_route_target_post"),
				),
			)
			.limit(1);

		const unlikeResponse = await app.request(
			"/v1/posts/developer_route_target_post/likes",
			{
				method: "DELETE",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);
		const unliked = (await unlikeResponse.json()) as {
			liked: boolean;
			likes: number;
		};
		const [remainingLikeNotification] = await db
			.select({ id: schema.notifications.id })
			.from(schema.notifications)
			.where(eq(schema.notifications.id, savedLikeNotification?.id ?? ""))
			.limit(1);

		const repostResponse = await app.request(
			"/v1/posts/developer_route_target_post/reposts",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);
		const reposted = (await repostResponse.json()) as {
			reposted: boolean;
			reposts: number;
		};
		const [savedRepostNotification] = await db
			.select({
				id: schema.notifications.id,
				type: schema.notifications.type,
				sourceType: schema.notifications.sourceType,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(
						schema.notifications.recipientUserId,
						"developer_route_target_author",
					),
					eq(schema.notifications.actorUserId, "test_user_id"),
					eq(schema.notifications.type, "repost"),
					eq(schema.notifications.sourceType, "post_repost"),
					eq(schema.notifications.postId, "developer_route_target_post"),
				),
			)
			.limit(1);

		const unrepostResponse = await app.request(
			"/v1/posts/developer_route_target_post/reposts",
			{
				method: "DELETE",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);
		const unreposted = (await unrepostResponse.json()) as {
			reposted: boolean;
			reposts: number;
		};
		const [remainingRepostNotification] = await db
			.select({ id: schema.notifications.id })
			.from(schema.notifications)
			.where(eq(schema.notifications.id, savedRepostNotification?.id ?? ""))
			.limit(1);

		expect(likeResponse.status).toBe(200);
		expect(liked.liked).toBe(true);
		expect(liked.likes).toBe(1);
		expect(savedLikeNotification?.type).toBe("like");
		expect(savedLikeNotification?.sourceType).toBe("post_like");
		expect(unlikeResponse.status).toBe(200);
		expect(unliked.liked).toBe(false);
		expect(unliked.likes).toBe(0);
		expect(remainingLikeNotification).toBeUndefined();

		expect(repostResponse.status).toBe(200);
		expect(reposted.reposted).toBe(true);
		expect(reposted.reposts).toBe(1);
		expect(savedRepostNotification?.type).toBe("repost");
		expect(savedRepostNotification?.sourceType).toBe("post_repost");
		expect(unrepostResponse.status).toBe(200);
		expect(unreposted.reposted).toBe(false);
		expect(unreposted.reposts).toBe(0);
		expect(remainingRepostNotification).toBeUndefined();
	});

	it("Bearerトークンでリプライと引用投稿を作成すると通知が作成される", async () => {
		const token = await createDeveloperApiToken();

		await db.insert(schema.user).values([
			{
				id: "developer_reply_target_author",
				name: "Reply Target Author",
				email: "developer-reply-target-author@example.com",
				emailVerified: true,
			},
			{
				id: "developer_quote_target_author",
				name: "Quote Target Author",
				email: "developer-quote-target-author@example.com",
				emailVerified: true,
			},
		]);
		await db.insert(schema.posts).values([
			{
				id: "developer_reply_target_post",
				authorId: "developer_reply_target_author",
				content: "reply target",
			},
			{
				id: "developer_quote_target_post",
				authorId: "developer_quote_target_author",
				content: "quote target",
			},
		]);

		const replyFormData = new FormData();
		replyFormData.set("content", "developer api reply");
		replyFormData.set("replyToPostId", "developer_reply_target_post");

		const replyResponse = await app.request("/v1/posts", {
			method: "POST",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
			body: replyFormData,
		});
		const replied = (await replyResponse.json()) as {
			post: { id: string };
		};

		const [savedReplyNotification] = await db
			.select({
				type: schema.notifications.type,
				postId: schema.notifications.postId,
				sourceType: schema.notifications.sourceType,
				sourceId: schema.notifications.sourceId,
				actionUrl: schema.notifications.actionUrl,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(
						schema.notifications.recipientUserId,
						"developer_reply_target_author",
					),
					eq(schema.notifications.actorUserId, "test_user_id"),
					eq(schema.notifications.type, "reply"),
				),
			)
			.limit(1);

		const quoteFormData = new FormData();
		quoteFormData.set("content", "developer api quote");
		quoteFormData.set("quotePostId", "developer_quote_target_post");

		const quoteResponse = await app.request("/v1/posts", {
			method: "POST",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
			body: quoteFormData,
		});
		const quoted = (await quoteResponse.json()) as {
			post: { id: string };
		};

		const [savedQuoteNotification] = await db
			.select({
				type: schema.notifications.type,
				postId: schema.notifications.postId,
				quotePostId: schema.notifications.quotePostId,
				sourceType: schema.notifications.sourceType,
				sourceId: schema.notifications.sourceId,
				actionUrl: schema.notifications.actionUrl,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(
						schema.notifications.recipientUserId,
						"developer_quote_target_author",
					),
					eq(schema.notifications.actorUserId, "test_user_id"),
					eq(schema.notifications.type, "quote"),
				),
			)
			.limit(1);

		expect(replyResponse.status).toBe(201);
		expect(savedReplyNotification?.type).toBe("reply");
		expect(savedReplyNotification?.postId).toBe("developer_reply_target_post");
		expect(savedReplyNotification?.sourceType).toBe("post_reply");
		expect(savedReplyNotification?.sourceId).toBe(replied.post.id);
		expect(savedReplyNotification?.actionUrl).toBe(
			"/posts/developer_reply_target_post",
		);

		expect(quoteResponse.status).toBe(201);
		expect(savedQuoteNotification?.type).toBe("quote");
		expect(savedQuoteNotification?.postId).toBe("developer_quote_target_post");
		expect(savedQuoteNotification?.quotePostId).toBe(quoted.post.id);
		expect(savedQuoteNotification?.sourceType).toBe("quote_post");
		expect(savedQuoteNotification?.sourceId).toBe(quoted.post.id);
		expect(savedQuoteNotification?.actionUrl).toBe(`/posts/${quoted.post.id}`);
	});

	it("Bearerトークンで通知一覧と未読件数を取得できる", async () => {
		const token = await createDeveloperApiToken();
		const postId = "developer_notifications_post";

		await db.insert(schema.user).values({
			id: "developer_notifications_actor",
			name: "Notify Actor",
			email: "developer-notify-actor@example.com",
			emailVerified: true,
		});

		await db.insert(schema.posts).values({
			id: postId,
			authorId: "test_user_id",
			content: "developer notifications target",
		});

		await db.insert(schema.notifications).values([
			{
				id: "developer_notifications_like",
				recipientUserId: "test_user_id",
				actorUserId: "developer_notifications_actor",
				type: "like",
				postId,
				sourceType: "post_like",
				sourceId: "developer_notifications_like_source",
				actionUrl: `/posts/${postId}`,
			},
			{
				id: "developer_notifications_info",
				recipientUserId: "test_user_id",
				type: "info",
				sourceType: "system_manual",
				sourceId: "developer_notifications_info_source",
				title: "Info",
				body: "Read notification",
				readAt: new Date("2026-01-03T00:00:00.000Z"),
			},
		]);

		const unreadBeforeResponse = await app.request(
			"/v1/notifications/unread-count",
			{
				method: "GET",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);
		const unreadBefore = (await unreadBeforeResponse.json()) as {
			count: number;
		};

		const listResponse = await app.request("/v1/notifications?type=like", {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});
		const listed = (await listResponse.json()) as {
			items: Array<{ type: string; actorCount: number }>;
			unreadCount: number;
		};

		const markReadResponse = await app.request(
			"/v1/notifications?markAsRead=true",
			{
				method: "GET",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);

		const unreadAfterResponse = await app.request(
			"/v1/notifications/unread-count",
			{
				method: "GET",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);
		const unreadAfter = (await unreadAfterResponse.json()) as { count: number };

		expect(unreadBeforeResponse.status).toBe(200);
		expect(unreadBefore.count).toBe(1);
		expect(listResponse.status).toBe(200);
		expect(listed.items.length).toBe(1);
		expect(listed.items[0]?.type).toBe("like");
		expect(listed.items[0]?.actorCount).toBe(1);
		expect(listed.unreadCount).toBe(1);
		expect(markReadResponse.status).toBe(200);
		expect(unreadAfterResponse.status).toBe(200);
		expect(unreadAfter.count).toBe(0);
	});

	it("BearerトークンでnotificationId指定の通知詳細を取得できる", async () => {
		const token = await createDeveloperApiToken();
		const actorUserId = "developer_notification_detail_actor";
		const postId = "developer_notification_detail_post";
		const notificationId = "developer_notification_detail_like";

		await db.insert(schema.user).values({
			id: actorUserId,
			name: "Detail Actor",
			email: "developer-notification-detail-actor@example.com",
			emailVerified: true,
		});

		await db.insert(schema.posts).values({
			id: postId,
			authorId: "test_user_id",
			content: "notification detail target post",
		});

		await db.insert(schema.notifications).values({
			id: notificationId,
			recipientUserId: "test_user_id",
			actorUserId,
			type: "like",
			postId,
			sourceType: "post_like",
			sourceId: "developer_notification_detail_source",
		});

		const response = await app.request(`/v1/notifications/${notificationId}`, {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});
		const body = (await response.json()) as {
			notification: {
				id: string;
				type: string;
				sourceType: string;
				sourceId: string;
				readAt: string | null;
				actionUrl: string | null;
				actor: { id: string } | null;
				post: { id: string } | null;
				quotePost: { id: string } | null;
			};
		};

		expect(response.status).toBe(200);
		expect(body.notification.id).toBe(notificationId);
		expect(body.notification.type).toBe("like");
		expect(body.notification.sourceType).toBe("post_like");
		expect(body.notification.sourceId).toBe(
			"developer_notification_detail_source",
		);
		expect(body.notification.readAt).toBeNull();
		expect(body.notification.actionUrl).toBe(`/posts/${postId}`);
		expect(body.notification.actor?.id).toBe(actorUserId);
		expect(body.notification.post?.id).toBe(postId);
		expect(body.notification.quotePost).toBeNull();
	});

	it("他ユーザー宛てのnotificationIdはBearerトークンで取得できない", async () => {
		const token = await createDeveloperApiToken();
		const recipientUserId = "developer_notification_detail_other_user";
		const notificationId = "developer_notification_detail_other";

		await db.insert(schema.user).values({
			id: recipientUserId,
			name: "Other Recipient",
			email: "developer-notification-detail-other@example.com",
			emailVerified: true,
		});

		await db.insert(schema.notifications).values({
			id: notificationId,
			recipientUserId,
			type: "info",
			sourceType: "system_manual",
			sourceId: "developer_notification_detail_other_source",
			title: "hidden",
			body: "not your notification",
		});

		const response = await app.request(`/v1/notifications/${notificationId}`, {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});

		expect(response.status).toBe(404);
	});

	it("通知Webhookの作成・送信・削除ができる", async () => {
		const token = await createDeveloperApiToken();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 200 }));

		const createWebhookResponse = await app.request(
			"/v1/notifications/webhooks",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					authorization: `Bearer ${token.plainToken}`,
				},
				body: JSON.stringify({
					name: "Main Hook",
					endpoint: "https://hooks.example.com/numatter",
				}),
			},
		);
		const created = (await createWebhookResponse.json()) as {
			webhook: { id: string; endpoint: string };
			plainSecret: string;
		};

		const sendResponse = await app.request("/v1/notifications/webhooks/send", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				authorization: `Bearer ${token.plainToken}`,
			},
			body: JSON.stringify({
				webhookId: created.webhook.id,
			}),
		});
		const sent = (await sendResponse.json()) as {
			results: Array<{ status: string }>;
			itemCount: number;
			unreadCount: number;
		};

		const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
		const sentPayload = JSON.parse(String(requestInit?.body ?? "{}")) as {
			event: string;
			items: unknown[];
			unreadCount: number;
		};

		const deleteWebhookResponse = await app.request(
			`/v1/notifications/webhooks/${created.webhook.id}`,
			{
				method: "DELETE",
				headers: {
					authorization: `Bearer ${token.plainToken}`,
				},
			},
		);

		expect(createWebhookResponse.status).toBe(201);
		expect(created.plainSecret.startsWith("nmt_whsec_")).toBe(true);
		expect(sendResponse.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(sent.results[0]?.status).toBe("success");
		expect(Array.isArray(sentPayload.items)).toBe(true);
		expect(sentPayload.event).toBe("notifications.snapshot");
		expect(typeof sentPayload.unreadCount).toBe("number");
		expect(sent.itemCount).toBe(sentPayload.items.length);
		expect(sent.unreadCount).toBe(sentPayload.unreadCount);
		expect(deleteWebhookResponse.status).toBe(200);

		fetchSpy.mockRestore();
	});

	it("通知Webhookをad-hocエンドポイントへ送信できる", async () => {
		const token = await createDeveloperApiToken();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 202 }));

		const sendResponse = await app.request("/v1/notifications/webhooks/send", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				authorization: `Bearer ${token.plainToken}`,
			},
			body: JSON.stringify({
				endpoint: "https://hooks.example.com/ad-hoc",
				secret: "ad-hoc-secret-123456",
			}),
		});
		const body = (await sendResponse.json()) as {
			results: Array<{
				endpoint: string;
				status: string;
				statusCode: number | null;
			}>;
		};

		expect(sendResponse.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(body.results[0]?.endpoint).toBe("https://hooks.example.com/ad-hoc");
		expect(body.results[0]?.status).toBe("success");
		expect(body.results[0]?.statusCode).toBe(202);

		fetchSpy.mockRestore();
	});

	it("失効済みBearerトークンは利用できない", async () => {
		const token = await createDeveloperApiToken();

		const revokeResponse = await app.request(`/tokens/${token.token.id}`, {
			method: "DELETE",
		});

		const profileResponse = await app.request("/v1/profile", {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});

		expect(revokeResponse.status).toBe(200);
		expect(profileResponse.status).toBe(401);
	});

	it("BANされたユーザーのBearerトークンは利用できない", async () => {
		const token = await createDeveloperApiToken();

		await db
			.update(schema.user)
			.set({
				isBanned: true,
				updatedAt: new Date("2026-01-01T00:00:00.000Z"),
			})
			.where(eq(schema.user.id, "test_user_id"));

		const profileResponse = await app.request("/v1/profile", {
			method: "GET",
			headers: {
				authorization: `Bearer ${token.plainToken}`,
			},
		});

		expect(profileResponse.status).toBe(403);
	});
});

const createDeveloperApiToken = async () => {
	await createUser({ isDeveloper: true });

	const response = await app.request("/tokens", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name: "Test Token",
		}),
	});
	const body = (await response.json()) as {
		token: {
			id: string;
		};
		plainToken: string;
	};

	expect(response.status).toBe(201);

	return body;
};
