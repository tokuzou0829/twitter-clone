import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./users";

const { createUser, db } = await setup();

describe("/routes/users", () => {
	it("未ログイン時に /me は取得できない", async () => {
		const response = await app.request("/me", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("ログイン時に /me を取得できる", async () => {
		const user = await createUser();
		const response = await app.request("/me", {
			method: "GET",
		});
		const json = (await response.json()) as {
			user: { id: string; handle: string | null };
		};

		expect(response.status).toBe(200);
		expect(json.user.id).toBe(user.id);
		expect(json.user.handle).toBeNull();
		expect(json.user).not.toHaveProperty("email");
	});

	it("BANされたユーザーは /me を取得できない", async () => {
		await createUser({ isBanned: true });

		const response = await app.request("/me", {
			method: "GET",
		});

		expect(response.status).toBe(403);
	});

	it("IP BANされたIPは全APIアクセスが拒否される", async () => {
		await db.insert(schema.ipBans).values({
			id: "ip_ban_exact",
			network: "203.0.113.10/32",
			reason: "test",
		});

		const response = await app.request("/public_user_id", {
			method: "GET",
			headers: {
				"x-forwarded-for": "203.0.113.10",
			},
		});

		expect(response.status).toBe(403);
	});

	it("IP BANはCIDR指定でも判定される", async () => {
		await db.insert(schema.ipBans).values({
			id: "ip_ban_cidr",
			network: "198.51.100.0/24",
			reason: "test",
		});

		const response = await app.request("/public_user_id", {
			method: "GET",
			headers: {
				"x-forwarded-for": "198.51.100.42, 10.0.0.5",
			},
		});

		expect(response.status).toBe(403);
	});

	it("他ユーザー取得時にメールアドレスは含まれない", async () => {
		await createUser();
		await db.insert(schema.user).values({
			id: "public_user_id",
			name: "Public User",
			handle: "public_user",
			email: "public@example.com",
			emailVerified: true,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		});

		const response = await app.request("/public_user_id", {
			method: "GET",
		});
		const json = (await response.json()) as {
			user: { id: string; handle: string | null };
		};

		expect(response.status).toBe(200);
		expect(json.user.id).toBe("public_user_id");
		expect(json.user.handle).toBe("public_user");
		expect(json.user).not.toHaveProperty("email");
	});

	it("未ログイン時に /me/developer は利用できない", async () => {
		const response = await app.request("/me/developer", {
			method: "POST",
		});

		expect(response.status).toBe(401);
	});

	it("ログイン時に /me/developer で開発者登録できる", async () => {
		await createUser();

		const response = await app.request("/me/developer", {
			method: "POST",
		});
		const body = (await response.json()) as {
			isDeveloper: boolean;
		};

		const [storedUser] = await db
			.select({
				isDeveloper: schema.user.isDeveloper,
			})
			.from(schema.user)
			.where(eq(schema.user.id, "test_user_id"))
			.limit(1);

		expect(response.status).toBe(200);
		expect(body.isDeveloper).toBe(true);
		expect(storedUser?.isDeveloper).toBe(true);
	});

	it("フォローと解除ができる", async () => {
		const currentUser = await createUser();
		await db.insert(schema.user).values({
			id: "target_user_id",
			name: "Target User",
			handle: "target_user",
			email: "target@example.com",
			emailVerified: true,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		});

		const followResponse = await app.request("/target_user_id/follow", {
			method: "POST",
		});
		const followed = (await followResponse.json()) as {
			viewer: { isFollowing: boolean };
			stats: { followers: number };
		};

		const unfollowResponse = await app.request("/target_user_id/follow", {
			method: "DELETE",
		});
		const unfollowed = (await unfollowResponse.json()) as {
			viewer: { isFollowing: boolean };
			stats: { followers: number };
		};

		expect(followResponse.status).toBe(200);
		expect(followed.viewer.isFollowing).toBe(true);
		expect(followed.stats.followers).toBe(1);

		expect(unfollowResponse.status).toBe(200);
		expect(unfollowed.viewer.isFollowing).toBe(false);
		expect(unfollowed.stats.followers).toBe(0);

		expect(currentUser.id).toBe("test_user_id");
	});

	it("フォロー通知は作成され解除で削除される", async () => {
		const follower = await createUser();
		const targetUserId = "follow_notification_target";

		await db.insert(schema.user).values({
			id: targetUserId,
			name: "Follow Target",
			email: "follow-notification-target@example.com",
		});

		const followResponse = await app.request(`/${targetUserId}/follow`, {
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
					eq(schema.notifications.recipientUserId, targetUserId),
					eq(schema.notifications.actorUserId, follower.id),
					eq(schema.notifications.type, "follow"),
				),
			)
			.limit(1);

		const unfollowResponse = await app.request(`/${targetUserId}/follow`, {
			method: "DELETE",
		});

		const [remainingNotification] = await db
			.select({ id: schema.notifications.id })
			.from(schema.notifications)
			.where(eq(schema.notifications.id, savedNotification?.id ?? ""))
			.limit(1);

		expect(followResponse.status).toBe(200);
		expect(savedNotification?.type).toBe("follow");
		expect(unfollowResponse.status).toBe(200);
		expect(remainingNotification).toBeUndefined();
	});

	it("フォロー通知作成時に通知Webhookへ配信される", async () => {
		await createUser();
		const targetUserId = "follow_webhook_target";
		await db.insert(schema.user).values({
			id: targetUserId,
			name: "Webhook Target",
			email: "follow-webhook-target@example.com",
		});
		await db.insert(schema.developerNotificationWebhooks).values({
			id: "follow_webhook_id",
			userId: targetUserId,
			name: "Follow Hook",
			endpoint: "https://hooks.example.com/follow",
			secret: "follow-webhook-secret",
			isActive: true,
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 200 }));

		const response = await app.request(`/${targetUserId}/follow`, {
			method: "POST",
		});

		const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
		const payload = JSON.parse(String(requestInit?.body ?? "{}")) as {
			event: string;
			trigger: { type: string } | null;
		};

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(payload.event).toBe("notifications.snapshot");
		expect(payload.trigger?.type).toBe("follow");

		fetchSpy.mockRestore();
	});

	it("フォロワー一覧を取得できる", async () => {
		await createUser();
		await db.insert(schema.user).values([
			{
				id: "list_target_user_id",
				name: "List Target",
				handle: "list_target",
				email: "list_target@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
			{
				id: "follower_user_1",
				name: "Follower 1",
				handle: "follower_1",
				email: "follower_1@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
			{
				id: "follower_user_2",
				name: "Follower 2",
				handle: "follower_2",
				email: "follower_2@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
		]);

		await db.insert(schema.follows).values([
			{
				id: "follow_list_1",
				followerId: "follower_user_1",
				followingId: "list_target_user_id",
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
			{
				id: "follow_list_2",
				followerId: "follower_user_2",
				followingId: "list_target_user_id",
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
			},
		]);

		const response = await app.request("/list_target_user_id/followers", {
			method: "GET",
		});
		const body = (await response.json()) as {
			users: Array<{ id: string; handle: string | null }>;
		};

		expect(response.status).toBe(200);
		expect(body.users.map((user) => user.id)).toEqual([
			"follower_user_2",
			"follower_user_1",
		]);
		expect(body.users[0]?.handle).toBe("follower_2");
	});

	it("フォロー中一覧を取得できる", async () => {
		await createUser();
		await db.insert(schema.user).values([
			{
				id: "list_source_user_id",
				name: "List Source",
				handle: "list_source",
				email: "list_source@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
			{
				id: "following_user_1",
				name: "Following 1",
				handle: "following_1",
				email: "following_1@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
			{
				id: "following_user_2",
				name: "Following 2",
				handle: "following_2",
				email: "following_2@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
		]);

		await db.insert(schema.follows).values([
			{
				id: "follow_list_3",
				followerId: "list_source_user_id",
				followingId: "following_user_1",
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
			{
				id: "follow_list_4",
				followerId: "list_source_user_id",
				followingId: "following_user_2",
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
			},
		]);

		const response = await app.request("/list_source_user_id/following", {
			method: "GET",
		});
		const body = (await response.json()) as {
			users: Array<{ id: string; handle: string | null }>;
		};

		expect(response.status).toBe(200);
		expect(body.users.map((user) => user.id)).toEqual([
			"following_user_2",
			"following_user_1",
		]);
		expect(body.users[0]?.handle).toBe("following_2");
	});

	it("存在しないユーザーのフォロー一覧は 404 になる", async () => {
		const followersResponse = await app.request("/missing_user/followers", {
			method: "GET",
		});
		const followingResponse = await app.request("/missing_user/following", {
			method: "GET",
		});

		expect(followersResponse.status).toBe(404);
		expect(followingResponse.status).toBe(404);
	});

	it("プロフィールの名前と自己紹介を更新できる", async () => {
		await createUser();
		const formData = new FormData();
		formData.set("name", "Updated Name");
		formData.set("handle", "updated_handle");
		formData.set("bio", "Updated bio");

		const response = await app.request("/me", {
			method: "PATCH",
			body: formData,
		});
		const json = (await response.json()) as {
			user: { name: string; handle: string | null; bio: string | null };
		};

		expect(response.status).toBe(200);
		expect(json.user.name).toBe("Updated Name");
		expect(json.user.handle).toBe("updated_handle");
		expect(json.user.bio).toBe("Updated bio");
	});

	it("すでに使われているハンドルには更新できない", async () => {
		await createUser();
		await db.insert(schema.user).values({
			id: "taken_handle_user",
			name: "Taken Handle User",
			handle: "taken_handle",
			email: "taken-handle@example.com",
			emailVerified: true,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		});

		const formData = new FormData();
		formData.set("handle", "taken_handle");

		const response = await app.request("/me", {
			method: "PATCH",
			body: formData,
		});

		expect(response.status).toBe(400);
	});
});
