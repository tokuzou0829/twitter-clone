import { and, count, eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./notifications";

const { createUser, db } = await setup();

describe("/routes/notifications", () => {
	it("未ログイン時は通知を取得できない", async () => {
		const response = await app.request("/", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("未ログイン時は未読件数を取得できない", async () => {
		const response = await app.request("/unread-count", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("未読件数を取得できる", async () => {
		const recipient = await createUser();
		const otherUserId = "notifications_unread_other_user";

		await db.insert(schema.user).values({
			id: otherUserId,
			name: "Other",
			email: "notifications-unread-other@example.com",
		});

		await db.insert(schema.notifications).values([
			{
				id: "notifications_unread_a",
				recipientUserId: recipient.id,
				type: "info",
				sourceType: "system_manual",
				sourceId: "notifications_unread_source_a",
				title: "Unread",
				body: "Unread notification",
			},
			{
				id: "notifications_unread_b",
				recipientUserId: recipient.id,
				type: "info",
				sourceType: "system_manual",
				sourceId: "notifications_unread_source_b",
				title: "Read",
				body: "Read notification",
				readAt: new Date("2026-01-03T00:00:00.000Z"),
			},
			{
				id: "notifications_unread_c",
				recipientUserId: otherUserId,
				type: "info",
				sourceType: "system_manual",
				sourceId: "notifications_unread_source_c",
				title: "Other",
				body: "Other user unread",
			},
		]);

		const response = await app.request("/unread-count", {
			method: "GET",
		});
		const body = (await response.json()) as {
			count: number;
		};

		expect(response.status).toBe(200);
		expect(body.count).toBe(1);
	});

	it("all通知取得時に未読通知を既読化する", async () => {
		const recipient = await createUser();

		await db.insert(schema.notifications).values([
			{
				id: "notifications_mark_read_a",
				recipientUserId: recipient.id,
				type: "info",
				sourceType: "system_manual",
				sourceId: "notifications_mark_read_source_a",
				title: "A",
				body: "A",
			},
			{
				id: "notifications_mark_read_b",
				recipientUserId: recipient.id,
				type: "violation",
				sourceType: "system_manual",
				sourceId: "notifications_mark_read_source_b",
				title: "B",
				body: "B",
			},
		]);

		const response = await app.request("/", {
			method: "GET",
		});

		const [remainingUnread] = await db
			.select({ count: count() })
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.recipientUserId, recipient.id),
					isNull(schema.notifications.readAt),
				),
			);

		expect(response.status).toBe(200);
		expect(Number(remainingUnread?.count ?? 0)).toBe(0);
	});

	it("いいね通知は投稿ごとにスタックされる", async () => {
		const recipient = await createUser();
		const firstActorId = "notifications_like_actor_1";
		const secondActorId = "notifications_like_actor_2";
		const targetPostId = "notifications_like_target_post";

		await db.insert(schema.user).values([
			{
				id: firstActorId,
				name: "First Actor",
				handle: "first_actor",
				email: "notifications-first-actor@example.com",
			},
			{
				id: secondActorId,
				name: "Second Actor",
				handle: "second_actor",
				email: "notifications-second-actor@example.com",
			},
		]);

		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId: recipient.id,
			content: "target post",
		});

		await db.insert(schema.notifications).values([
			{
				id: "notifications_like_1",
				recipientUserId: recipient.id,
				actorUserId: firstActorId,
				type: "like",
				postId: targetPostId,
				sourceType: "post_like",
				sourceId: "notifications_like_source_1",
				actionUrl: `/posts/${targetPostId}`,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			{
				id: "notifications_like_2",
				recipientUserId: recipient.id,
				actorUserId: secondActorId,
				type: "like",
				postId: targetPostId,
				sourceType: "post_like",
				sourceId: "notifications_like_source_2",
				actionUrl: `/posts/${targetPostId}`,
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
		]);

		const response = await app.request("/", {
			method: "GET",
		});
		const body = (await response.json()) as {
			items: Array<{
				type: string;
				actorCount: number;
				actors: Array<{ id: string }>;
				post: { id: string } | null;
			}>;
		};

		expect(response.status).toBe(200);
		expect(body.items.length).toBe(1);
		expect(body.items[0]?.type).toBe("like");
		expect(body.items[0]?.actorCount).toBe(2);
		expect(body.items[0]?.actors[0]?.id).toBe(secondActorId);
		expect(body.items[0]?.actors[1]?.id).toBe(firstActorId);
		expect(body.items[0]?.post?.id).toBe(targetPostId);
	});

	it("typeフィルタで通知を絞り込める", async () => {
		const recipient = await createUser();
		const followerId = "notifications_filter_follower";
		const likerId = "notifications_filter_liker";
		const targetPostId = "notifications_filter_post";

		await db.insert(schema.user).values([
			{
				id: followerId,
				name: "Follower",
				email: "notifications-filter-follower@example.com",
			},
			{
				id: likerId,
				name: "Liker",
				email: "notifications-filter-liker@example.com",
			},
		]);

		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId: recipient.id,
			content: "filter target",
		});

		await db.insert(schema.notifications).values([
			{
				id: "notifications_filter_follow",
				recipientUserId: recipient.id,
				actorUserId: followerId,
				type: "follow",
				sourceType: "follow",
				sourceId: "notifications_filter_follow_source",
				actionUrl: `/users/${followerId}`,
			},
			{
				id: "notifications_filter_like",
				recipientUserId: recipient.id,
				actorUserId: likerId,
				type: "like",
				postId: targetPostId,
				sourceType: "post_like",
				sourceId: "notifications_filter_like_source",
				actionUrl: `/posts/${targetPostId}`,
			},
		]);

		const response = await app.request("/?type=follow", {
			method: "GET",
		});
		const body = (await response.json()) as {
			items: Array<{ type: string }>;
		};

		expect(response.status).toBe(200);
		expect(body.items.length).toBe(1);
		expect(body.items[0]?.type).toBe("follow");
	});

	it("type=replyでリプライ通知を絞り込める", async () => {
		const recipient = await createUser();
		const replierId = "notifications_filter_replier";
		const targetPostId = "notifications_filter_reply_post";

		await db.insert(schema.user).values({
			id: replierId,
			name: "Replier",
			email: "notifications-filter-replier@example.com",
		});

		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId: recipient.id,
			content: "reply target",
		});

		await db.insert(schema.notifications).values({
			id: "notifications_filter_reply",
			recipientUserId: recipient.id,
			actorUserId: replierId,
			type: "reply",
			postId: targetPostId,
			sourceType: "post_reply",
			sourceId: "notifications_filter_reply_source",
			actionUrl: `/posts/${targetPostId}`,
		});

		const response = await app.request("/?type=reply", {
			method: "GET",
		});
		const body = (await response.json()) as {
			items: Array<{ type: string; post: { id: string } | null }>;
		};

		expect(response.status).toBe(200);
		expect(body.items.length).toBe(1);
		expect(body.items[0]?.type).toBe("reply");
		expect(body.items[0]?.post?.id).toBe(targetPostId);
	});

	it("type=mentionでメンション通知を絞り込める", async () => {
		const recipient = await createUser();
		const actorId = "notifications_filter_mention_actor";
		const targetPostId = "notifications_filter_mention_post";

		await db.insert(schema.user).values({
			id: actorId,
			name: "Mention Actor",
			email: "notifications-filter-mention-actor@example.com",
		});

		await db.insert(schema.posts).values({
			id: targetPostId,
			authorId: actorId,
			content: "mention target",
		});

		await db.insert(schema.notifications).values({
			id: "notifications_filter_mention",
			recipientUserId: recipient.id,
			actorUserId: actorId,
			type: "mention",
			postId: targetPostId,
			sourceType: "post_mention",
			sourceId: `notifications_filter_mention_source:${recipient.id}`,
			actionUrl: `/posts/${targetPostId}`,
		});

		const response = await app.request("/?type=mention", {
			method: "GET",
		});
		const body = (await response.json()) as {
			items: Array<{ type: string; post: { id: string } | null }>;
		};

		expect(response.status).toBe(200);
		expect(body.items.length).toBe(1);
		expect(body.items[0]?.type).toBe("mention");
		expect(body.items[0]?.post?.id).toBe(targetPostId);
	});

	it("開発者以外はsystem通知を作成できない", async () => {
		await createUser();
		await db.insert(schema.user).values({
			id: "notifications_system_target",
			name: "Target",
			email: "notifications-system-target@example.com",
		});

		const response = await app.request("/system", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				recipientUserId: "notifications_system_target",
				type: "info",
				title: "test",
				body: "hello",
			}),
		});

		expect(response.status).toBe(403);
	});

	it("開発者はsystem通知を作成できる", async () => {
		await createUser({ isDeveloper: true });
		const recipientUserId = "notifications_system_target_dev";
		await db.insert(schema.user).values({
			id: recipientUserId,
			name: "Recipient",
			email: "notifications-system-target-dev@example.com",
		});

		const response = await app.request("/system", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				recipientUserId,
				type: "violation",
				title: "ポリシー違反",
				body: "違反の可能性がある投稿を検知しました。",
				actionUrl: "/help/safety",
			}),
		});
		const payload = (await response.json()) as {
			notificationId: string;
		};

		const [saved] = await db
			.select({
				id: schema.notifications.id,
				type: schema.notifications.type,
				title: schema.notifications.title,
			})
			.from(schema.notifications)
			.where(
				and(
					eq(schema.notifications.id, payload.notificationId),
					eq(schema.notifications.recipientUserId, recipientUserId),
				),
			)
			.limit(1);

		expect(response.status).toBe(201);
		expect(saved?.type).toBe("violation");
		expect(saved?.title).toBe("ポリシー違反");
	});

	it("system通知作成時に通知Webhookへ配信される", async () => {
		await createUser({ isDeveloper: true });
		const recipientUserId = "notifications_system_webhook_target";
		await db.insert(schema.user).values({
			id: recipientUserId,
			name: "Webhook Recipient",
			email: "notifications-system-webhook-target@example.com",
		});
		await db.insert(schema.developerNotificationWebhooks).values({
			id: "notifications_system_webhook_id",
			userId: recipientUserId,
			name: "System Hook",
			endpoint: "https://hooks.example.com/system",
			secret: "system-webhook-secret",
			isActive: true,
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 200 }));

		const response = await app.request("/system", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				recipientUserId,
				type: "info",
				title: "System update",
				body: "hello",
			}),
		});

		const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
		const payload = JSON.parse(String(requestInit?.body ?? "{}")) as {
			event: string;
			trigger: { type: string } | null;
		};

		expect(response.status).toBe(201);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(payload.event).toBe("notifications.snapshot");
		expect(payload.trigger?.type).toBe("info");

		fetchSpy.mockRestore();
	});
});
