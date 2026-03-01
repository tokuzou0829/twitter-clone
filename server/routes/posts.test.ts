import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./posts";

const { createUser, db } = await setup();

describe("/routes/posts", () => {
	it("未ログイン時は投稿できない", async () => {
		const formData = new FormData();
		formData.set("content", "hello");

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});

		expect(response.status).toBe(401);
	});

	it("投稿文字数の上限はAPIで検証する", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("content", "a".repeat(281));

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});

		expect(response.status).toBe(400);
	});

	it("URLの文字数は投稿文字数に含めない", async () => {
		await createUser();
		const formData = new FormData();
		formData.set(
			"content",
			`${"a".repeat(280)}https://example.com/really/long/url`,
		);

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});

		expect(response.status).toBe(201);
	});

	it("URLを除いた投稿文字数が上限超過ならエラー", async () => {
		await createUser();
		const formData = new FormData();
		formData.set(
			"content",
			`${"a".repeat(281)}https://example.com/really/long/url`,
		);

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});

		expect(response.status).toBe(400);
	});

	it("投稿時にリンク情報を保存して返す", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("content", "hello https://example.com/path");

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});
		const body = (await response.json()) as {
			post: {
				id: string;
				links: Array<{ id: string; url: string; host: string }>;
			};
		};

		const [relation] = await db
			.select({
				postId: schema.postLinks.postId,
				linkId: schema.postLinks.linkId,
			})
			.from(schema.postLinks)
			.where(eq(schema.postLinks.postId, body.post.id))
			.limit(1);

		expect(response.status).toBe(201);
		expect(body.post.links.length).toBe(1);
		expect(body.post.links[0]?.url).toBe("https://example.com/path");
		expect(body.post.links[0]?.host).toBe("example.com");
		expect(relation?.postId).toBe(body.post.id);
		expect(relation?.linkId).toBe(body.post.links[0]?.id);
	});

	it("投稿時のメンションはuserIdで保存され通知される", async () => {
		const author = await createUser();
		const mentionedUserId = "mention_target_user_id";
		const mentionedHandle = "mention_target";

		await db.insert(schema.user).values({
			id: mentionedUserId,
			name: "Mention Target",
			handle: mentionedHandle,
			email: "mention-target@example.com",
			emailVerified: true,
		});

		const formData = new FormData();
		formData.set("content", `hello @${mentionedHandle}`);

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});
		const body = (await response.json()) as {
			post: {
				id: string;
				mentions: Array<{ user: { id: string }; start: number; end: number }>;
			};
		};

		const [savedMention] = await db
			.select({
				mentionedUserId: schema.postMentions.mentionedUserId,
				start: schema.postMentions.start,
				end: schema.postMentions.end,
			})
			.from(schema.postMentions)
			.where(eq(schema.postMentions.postId, body.post.id))
			.limit(1);

		const [savedNotification] = await db
			.select({
				type: schema.notifications.type,
				postId: schema.notifications.postId,
				sourceType: schema.notifications.sourceType,
				sourceId: schema.notifications.sourceId,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.recipientUserId, mentionedUserId),
					eq(schema.notifications.actorUserId, author.id),
					eq(schema.notifications.type, "mention"),
				),
			)
			.limit(1);

		expect(response.status).toBe(201);
		expect(savedMention?.mentionedUserId).toBe(mentionedUserId);
		expect(savedMention?.start).toBe(6);
		expect(savedMention?.end).toBe(21);
		expect(body.post.mentions[0]?.user.id).toBe(mentionedUserId);
		expect(savedNotification?.type).toBe("mention");
		expect(savedNotification?.postId).toBe(body.post.id);
		expect(savedNotification?.sourceType).toBe("post_mention");
		expect(savedNotification?.sourceId).toBe(
			`${body.post.id}:${mentionedUserId}`,
		);
	});

	it("投稿画像は4枚まで", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("content", "with too many files");

		for (let index = 0; index < 5; index += 1) {
			formData.append(
				"images",
				new File([`file-${index}`], `img-${index}.png`, { type: "image/png" }),
			);
		}

		const response = await app.request("/", {
			method: "POST",
			body: formData,
		});

		expect(response.status).toBe(400);
	});

	it("短時間の連投は429で抑止される", async () => {
		await createUser();

		for (let index = 0; index < 8; index += 1) {
			const formData = new FormData();
			formData.set("content", `burst-${index}`);
			const response = await app.request("/", {
				method: "POST",
				body: formData,
			});
			expect(response.status).toBe(201);
		}

		const blockedFormData = new FormData();
		blockedFormData.set("content", "burst-blocked");
		const blocked = await app.request("/", {
			method: "POST",
			body: blockedFormData,
		});

		expect(blocked.status).toBe(429);
	});

	it("同一内容の連投は429で抑止される", async () => {
		await createUser();

		for (let index = 0; index < 2; index += 1) {
			const formData = new FormData();
			formData.set("content", "same-content-spam");
			const response = await app.request("/", {
				method: "POST",
				body: formData,
			});
			expect(response.status).toBe(201);
		}

		const blockedFormData = new FormData();
		blockedFormData.set("content", "same-content-spam");
		const blocked = await app.request("/", {
			method: "POST",
			body: blockedFormData,
		});

		expect(blocked.status).toBe(429);
	});

	it("投稿後にホームタイムラインへ表示される", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("content", "first post");

		const createResponse = await app.request("/", {
			method: "POST",
			body: formData,
		});
		const created = (await createResponse.json()) as {
			post: { id: string; content: string };
		};

		const timelineResponse = await app.request("/", {
			method: "GET",
		});
		const timeline = (await timelineResponse.json()) as {
			items: Array<{ type: string; post: { id: string; content: string } }>;
		};

		expect(createResponse.status).toBe(201);
		expect(timeline.items[0]?.post.id).toBe(created.post.id);
		expect(timeline.items[0]?.post.content).toBe("first post");
	});

	it("通常リポストはタイムラインイベントとして表示される", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("content", "base post");

		const createResponse = await app.request("/", {
			method: "POST",
			body: formData,
		});
		const created = (await createResponse.json()) as {
			post: { id: string };
		};

		const repostResponse = await app.request(`/${created.post.id}/reposts`, {
			method: "POST",
		});

		const timelineResponse = await app.request("/", {
			method: "GET",
		});
		const timeline = (await timelineResponse.json()) as {
			items: Array<{ type: string; post: { id: string } }>;
		};

		expect(repostResponse.status).toBe(200);
		expect(
			timeline.items.some(
				(item) => item.type === "repost" && item.post.id === created.post.id,
			),
		).toBe(true);
	});

	it("引用リポストを作成できる", async () => {
		await createUser();
		const baseFormData = new FormData();
		baseFormData.set("content", "original");

		const createResponse = await app.request("/", {
			method: "POST",
			body: baseFormData,
		});
		const created = (await createResponse.json()) as {
			post: { id: string };
		};

		const quoteFormData = new FormData();
		quoteFormData.set("content", "my comment");

		const quoteResponse = await app.request(`/${created.post.id}/quotes`, {
			method: "POST",
			body: quoteFormData,
		});
		const quoted = (await quoteResponse.json()) as {
			post: { quotePostId: string | null; content: string };
		};

		expect(quoteResponse.status).toBe(201);
		expect(quoted.post.quotePostId).toBe(created.post.id);
		expect(quoted.post.content).toBe("my comment");
	});

	it("他ユーザー投稿にリプライするとリプライ通知が作成される", async () => {
		const replier = await createUser();
		const authorId = "notification_reply_author";
		const targetPostId = "notification_reply_target_post";

		await db.insert(schema.user).values({
			id: authorId,
			name: "Reply Target",
			email: "notification-reply-author@example.com",
		});
		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId,
			content: "reply target",
		});

		const replyFormData = new FormData();
		replyFormData.set("content", "my reply");

		const replyResponse = await app.request(`/${targetPostId}/replies`, {
			method: "POST",
			body: replyFormData,
		});
		const replied = (await replyResponse.json()) as {
			post: { id: string; replyToPostId: string | null };
		};

		const [savedNotification] = await db
			.select({
				type: schema.notifications.type,
				postId: schema.notifications.postId,
				sourceType: schema.notifications.sourceType,
				sourceId: schema.notifications.sourceId,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.recipientUserId, authorId),
					eq(schema.notifications.actorUserId, replier.id),
					eq(schema.notifications.type, "reply"),
					eq(schema.notifications.postId, targetPostId),
				),
			)
			.limit(1);

		expect(replyResponse.status).toBe(201);
		expect(replied.post.replyToPostId).toBe(targetPostId);
		expect(savedNotification?.type).toBe("reply");
		expect(savedNotification?.postId).toBe(targetPostId);
		expect(savedNotification?.sourceType).toBe("post_reply");
		expect(savedNotification?.sourceId).toBe(replied.post.id);
	});

	it("リプライ通知作成時に通知Webhookへ配信される", async () => {
		await createUser();
		const authorId = "reply_webhook_target";
		const targetPostId = "reply_webhook_target_post";

		await db.insert(schema.user).values({
			id: authorId,
			name: "Reply Webhook Target",
			email: "reply-webhook-target@example.com",
		});
		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId,
			content: "reply webhook target",
		});
		await db.insert(schema.developerNotificationWebhooks).values({
			id: "reply_webhook_id",
			userId: authorId,
			name: "Reply Hook",
			endpoint: "https://hooks.example.com/reply",
			secret: "reply-webhook-secret",
			isActive: true,
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 200 }));

		const replyFormData = new FormData();
		replyFormData.set("content", "webhook reply");
		const response = await app.request(`/${targetPostId}/replies`, {
			method: "POST",
			body: replyFormData,
		});

		const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
		const payload = JSON.parse(String(requestInit?.body ?? "{}")) as {
			event: string;
			trigger: { type: string } | null;
		};

		expect(response.status).toBe(201);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(payload.event).toBe("notifications.snapshot");
		expect(payload.trigger?.type).toBe("reply");

		fetchSpy.mockRestore();
	});

	it("他ユーザーへのいいね通知は作成され解除で削除される", async () => {
		const liker = await createUser();
		const authorId = "notification_like_author";
		const targetPostId = "notification_like_post";

		await db.insert(schema.user).values({
			id: authorId,
			name: "Notification Author",
			email: "notification-like-author@example.com",
		});
		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId,
			content: "target post",
		});

		const likeResponse = await app.request(`/${targetPostId}/likes`, {
			method: "POST",
		});

		const [savedNotification] = await db
			.select({
				id: schema.notifications.id,
				type: schema.notifications.type,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.recipientUserId, authorId),
					eq(schema.notifications.actorUserId, liker.id),
					eq(schema.notifications.type, "like"),
					eq(schema.notifications.postId, targetPostId),
				),
			)
			.limit(1);

		const unlikeResponse = await app.request(`/${targetPostId}/likes`, {
			method: "DELETE",
		});

		const [remainingNotification] = await db
			.select({ id: schema.notifications.id })
			.from(schema.notifications)
			.where(eq(schema.notifications.id, savedNotification?.id ?? ""))
			.limit(1);

		expect(likeResponse.status).toBe(200);
		expect(savedNotification?.type).toBe("like");
		expect(unlikeResponse.status).toBe(200);
		expect(remainingNotification).toBeUndefined();
	});

	it("他ユーザー投稿を引用すると引用通知が作成される", async () => {
		const quoter = await createUser();
		const authorId = "notification_quote_author";
		const targetPostId = "notification_quote_target_post";

		await db.insert(schema.user).values({
			id: authorId,
			name: "Quote Target",
			email: "notification-quote-author@example.com",
		});
		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId,
			content: "quote target",
		});

		const quoteFormData = new FormData();
		quoteFormData.set("content", "my quote");

		const quoteResponse = await app.request(`/${targetPostId}/quotes`, {
			method: "POST",
			body: quoteFormData,
		});
		const quoted = (await quoteResponse.json()) as {
			post: { id: string };
		};

		const [savedNotification] = await db
			.select({
				type: schema.notifications.type,
				postId: schema.notifications.postId,
				quotePostId: schema.notifications.quotePostId,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.recipientUserId, authorId),
					eq(schema.notifications.actorUserId, quoter.id),
					eq(schema.notifications.type, "quote"),
				),
			)
			.limit(1);

		expect(quoteResponse.status).toBe(201);
		expect(savedNotification?.type).toBe("quote");
		expect(savedNotification?.postId).toBe(targetPostId);
		expect(savedNotification?.quotePostId).toBe(quoted.post.id);
	});

	it("未ログイン時は投稿を削除できない", async () => {
		await db.insert(schema.user).values({
			id: "delete_guest_author_id",
			name: "Guest Author",
			email: "delete-guest-author@example.com",
		});
		await db.insert(schema.posts).values({
			id: "delete_guest_post_id",
			authorId: "delete_guest_author_id",
			content: "guest post",
		});

		const response = await app.request("/delete_guest_post_id", {
			method: "DELETE",
		});

		expect(response.status).toBe(401);
	});

	it("自分の投稿を削除できる", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("content", "delete me");

		const createResponse = await app.request("/", {
			method: "POST",
			body: formData,
		});
		const created = (await createResponse.json()) as {
			post: { id: string };
		};

		const deleteResponse = await app.request(`/${created.post.id}`, {
			method: "DELETE",
		});

		const detailResponse = await app.request(`/${created.post.id}`, {
			method: "GET",
		});

		expect(createResponse.status).toBe(201);
		expect(deleteResponse.status).toBe(204);
		expect(detailResponse.status).toBe(404);
	});

	it("他人の投稿は削除できない", async () => {
		await createUser();
		await db.insert(schema.user).values({
			id: "delete_other_author_id",
			name: "Other Author",
			email: "delete-other-author@example.com",
		});
		await db.insert(schema.posts).values({
			id: "delete_other_post_id",
			authorId: "delete_other_author_id",
			content: "other user post",
		});

		const response = await app.request("/delete_other_post_id", {
			method: "DELETE",
		});

		expect(response.status).toBe(403);
	});

	it("親投稿を削除しても返信が残り、祖先へ付け替わる", async () => {
		await createUser();

		const rootFormData = new FormData();
		rootFormData.set("content", "root");
		const rootResponse = await app.request("/", {
			method: "POST",
			body: rootFormData,
		});
		const root = (await rootResponse.json()) as {
			post: { id: string };
		};

		const parentFormData = new FormData();
		parentFormData.set("content", "parent reply");
		const parentResponse = await app.request(`/${root.post.id}/replies`, {
			method: "POST",
			body: parentFormData,
		});
		const parent = (await parentResponse.json()) as {
			post: { id: string };
		};

		const childFormData = new FormData();
		childFormData.set("content", "child reply");
		const childResponse = await app.request(`/${parent.post.id}/replies`, {
			method: "POST",
			body: childFormData,
		});
		const child = (await childResponse.json()) as {
			post: { id: string };
		};

		const deleteResponse = await app.request(`/${parent.post.id}`, {
			method: "DELETE",
		});

		const parentDetailResponse = await app.request(`/${parent.post.id}`, {
			method: "GET",
		});
		const childDetailResponse = await app.request(`/${child.post.id}`, {
			method: "GET",
		});
		const childDetail = (await childDetailResponse.json()) as {
			post: { id: string; replyToPostId: string | null };
			conversationPath: Array<{ id: string }>;
		};

		expect(rootResponse.status).toBe(201);
		expect(parentResponse.status).toBe(201);
		expect(childResponse.status).toBe(201);
		expect(deleteResponse.status).toBe(204);
		expect(parentDetailResponse.status).toBe(404);
		expect(childDetailResponse.status).toBe(200);
		expect(childDetail.post.id).toBe(child.post.id);
		expect(childDetail.post.replyToPostId).toBe(root.post.id);
		expect(childDetail.conversationPath.map((post) => post.id)).toEqual([
			root.post.id,
		]);
	});

	it("投稿詳細は直下の返信のみを返す", async () => {
		await createUser();

		const rootFormData = new FormData();
		rootFormData.set("content", "thread root");
		const rootResponse = await app.request("/", {
			method: "POST",
			body: rootFormData,
		});
		const root = (await rootResponse.json()) as {
			post: { id: string };
		};

		const directReplyFormData = new FormData();
		directReplyFormData.set("content", "direct reply");
		const directReplyResponse = await app.request(`/${root.post.id}/replies`, {
			method: "POST",
			body: directReplyFormData,
		});
		const directReply = (await directReplyResponse.json()) as {
			post: { id: string };
		};

		const nestedReplyFormData = new FormData();
		nestedReplyFormData.set("content", "nested reply");
		const nestedReplyResponse = await app.request(
			`/${directReply.post.id}/replies`,
			{
				method: "POST",
				body: nestedReplyFormData,
			},
		);
		const nestedReply = (await nestedReplyResponse.json()) as {
			post: { id: string };
		};

		const detailResponse = await app.request(`/${root.post.id}`, {
			method: "GET",
		});
		const detail = (await detailResponse.json()) as {
			post: { id: string };
			conversationPath: Array<{ id: string }>;
			replies: Array<{ id: string; stats: { replies: number } }>;
		};

		const nestedDetailResponse = await app.request(`/${nestedReply.post.id}`, {
			method: "GET",
		});
		const nestedDetail = (await nestedDetailResponse.json()) as {
			post: { id: string };
			conversationPath: Array<{ id: string }>;
		};

		expect(rootResponse.status).toBe(201);
		expect(directReplyResponse.status).toBe(201);
		expect(nestedReplyResponse.status).toBe(201);
		expect(detailResponse.status).toBe(200);
		expect(nestedDetailResponse.status).toBe(200);
		expect(detail.post.id).toBe(root.post.id);
		expect(detail.conversationPath).toEqual([]);
		expect(detail.replies.length).toBe(1);
		expect(detail.replies[0]?.id).toBe(directReply.post.id);
		expect(detail.replies[0]?.stats.replies).toBe(1);
		expect(nestedDetail.post.id).toBe(nestedReply.post.id);
		expect(nestedDetail.conversationPath.map((post) => post.id)).toEqual([
			root.post.id,
			directReply.post.id,
		]);
	});

	it("プロフィールのRepliesタブは返信投稿だけ返す", async () => {
		await createUser();

		const targetUserId = "replies_tab_user_id";
		const parentAuthorId = "replies_tab_parent_author_id";
		const parentPostId = "replies_tab_parent_post_id";
		const rootPostId = "replies_tab_root_post_id";
		const replyPostId = "replies_tab_reply_post_id";

		await db.insert(schema.user).values([
			{
				id: targetUserId,
				name: "Replies Tab User",
				email: "replies-tab-user@example.com",
			},
			{
				id: parentAuthorId,
				name: "Replies Parent Author",
				email: "replies-tab-parent-author@example.com",
			},
		]);

		await db.insert(schema.posts).values([
			{
				id: parentPostId,
				authorId: parentAuthorId,
				content: "parent",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: rootPostId,
				authorId: targetUserId,
				content: "root post",
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
			{
				id: replyPostId,
				authorId: targetUserId,
				content: "reply post",
				replyToPostId: parentPostId,
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
			},
		]);

		const response = await app.request(`/?userId=${targetUserId}&tab=replies`, {
			method: "GET",
		});
		const timeline = (await response.json()) as {
			items: Array<{ post: { id: string; replyToPostId: string | null } }>;
		};

		expect(response.status).toBe(200);
		expect(timeline.items.map((item) => item.post.id)).toEqual([replyPostId]);
		expect(timeline.items[0]?.post.replyToPostId).toBe(parentPostId);
	});

	it("プロフィールのMediaタブは画像付き投稿のみ返す", async () => {
		await createUser();

		const targetUserId = "media_tab_user_id";
		const textPostId = "media_tab_text_post_id";
		const olderMediaPostId = "media_tab_older_post_id";
		const newerMediaPostId = "media_tab_newer_post_id";

		await db.insert(schema.user).values({
			id: targetUserId,
			name: "Media Tab User",
			email: "media-tab-user@example.com",
		});

		await db.insert(schema.posts).values([
			{
				id: textPostId,
				authorId: targetUserId,
				content: "text only",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: olderMediaPostId,
				authorId: targetUserId,
				content: "older media",
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
			{
				id: newerMediaPostId,
				authorId: targetUserId,
				content: "newer media",
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
			},
		]);

		await db.insert(schema.files).values([
			{
				id: "media_tab_file_old",
				bucket: "test",
				key: "posts/media-tab/old.png",
				contentType: "image/png",
				size: 100,
			},
			{
				id: "media_tab_file_new_1",
				bucket: "test",
				key: "posts/media-tab/new-1.png",
				contentType: "image/png",
				size: 200,
			},
			{
				id: "media_tab_file_new_2",
				bucket: "test",
				key: "posts/media-tab/new-2.png",
				contentType: "image/png",
				size: 250,
			},
		]);

		await db.insert(schema.postImages).values([
			{
				id: "media_tab_image_old",
				postId: olderMediaPostId,
				fileId: "media_tab_file_old",
				position: 0,
			},
			{
				id: "media_tab_image_new_1",
				postId: newerMediaPostId,
				fileId: "media_tab_file_new_1",
				position: 0,
			},
			{
				id: "media_tab_image_new_2",
				postId: newerMediaPostId,
				fileId: "media_tab_file_new_2",
				position: 1,
			},
		]);

		const response = await app.request(`/?userId=${targetUserId}&tab=media`, {
			method: "GET",
		});
		const timeline = (await response.json()) as {
			items: Array<{ post: { id: string } }>;
		};

		expect(response.status).toBe(200);
		expect(timeline.items.map((item) => item.post.id)).toEqual([
			newerMediaPostId,
			olderMediaPostId,
		]);
	});

	it("プロフィールのLikesタブはいいねした投稿をいいね順で返す", async () => {
		await createUser();

		const targetUserId = "likes_tab_user_id";
		const authorId = "likes_tab_author_id";
		const olderLikedPostId = "likes_tab_post_old";
		const newerLikedPostId = "likes_tab_post_new";

		await db.insert(schema.user).values([
			{
				id: targetUserId,
				name: "Likes Tab User",
				email: "likes-tab-user@example.com",
			},
			{
				id: authorId,
				name: "Likes Author",
				email: "likes-tab-author@example.com",
			},
		]);

		await db.insert(schema.posts).values([
			{
				id: olderLikedPostId,
				authorId,
				content: "older liked",
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: newerLikedPostId,
				authorId,
				content: "newer liked",
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
		]);

		await db.insert(schema.postLikes).values([
			{
				id: "likes_tab_like_old",
				postId: olderLikedPostId,
				userId: targetUserId,
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
			},
			{
				id: "likes_tab_like_new",
				postId: newerLikedPostId,
				userId: targetUserId,
				createdAt: new Date("2026-01-04T00:00:00.000Z"),
			},
		]);

		const response = await app.request(`/?userId=${targetUserId}&tab=likes`, {
			method: "GET",
		});
		const timeline = (await response.json()) as {
			items: Array<{ post: { id: string } }>;
		};

		expect(response.status).toBe(200);
		expect(timeline.items.map((item) => item.post.id)).toEqual([
			newerLikedPostId,
			olderLikedPostId,
		]);
	});

	it("投稿にいいねしたユーザー一覧を投稿者本人が取得できる", async () => {
		const author = await createUser();

		const targetPostId = "likers_post_id";
		const secondUserId = "likers_second_user_id";

		await db.insert(schema.user).values({
			id: secondUserId,
			name: "Second Liker",
			email: "second-liker@example.com",
		});

		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId: author.id,
			content: "liked post",
		});

		await db.insert(schema.postLikes).values([
			{
				id: "likers_like_old",
				postId: targetPostId,
				userId: author.id,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: "likers_like_new",
				postId: targetPostId,
				userId: secondUserId,
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
		]);

		const response = await app.request(`/${targetPostId}/likes`, {
			method: "GET",
		});
		const body = (await response.json()) as {
			users: Array<{ id: string; name: string }>;
		};

		expect(response.status).toBe(200);
		expect(body.users.map((user) => user.id)).toEqual([
			secondUserId,
			author.id,
		]);
	});

	it("存在しない投稿の詳細取得は404", async () => {
		await createUser();

		const response = await app.request("/unknown_post", {
			method: "GET",
		});

		expect(response.status).toBe(404);
	});
});
