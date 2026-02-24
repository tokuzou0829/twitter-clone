import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
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
});
