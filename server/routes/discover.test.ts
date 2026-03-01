import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./discover";

const { createUser, db } = await setup();

describe("/routes/discover", () => {
	it("直近投稿のハッシュタグからトレンドを返す", async () => {
		const user = await createUser();

		await db.insert(schema.posts).values([
			{
				id: "discover_post_1",
				authorId: user.id,
				content: "Working with #NextJS and #TypeScript",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "discover_post_2",
				authorId: user.id,
				content: "Shipped feature using #nextjs",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: "discover_post_old",
				authorId: user.id,
				content: "Old topic #legacy",
				createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
				updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
			},
		]);

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			trends: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.trends.some((trend) => trend.tag === "#nextjs")).toBe(true);
		expect(json.trends.find((trend) => trend.tag === "#nextjs")?.count).toBe(2);
		expect(json.trends.some((trend) => trend.tag === "#legacy")).toBe(false);
	});

	it("トレンド集計は500件を超えてもカウントできる", async () => {
		const user = await createUser();

		const now = new Date();
		await db.insert(schema.posts).values(
			Array.from({ length: 550 }, (_, index) => ({
				id: `discover_post_many_${index}`,
				authorId: user.id,
				content: "bulk #alice",
				createdAt: now,
				updatedAt: now,
			})),
		);

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			trends: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.trends.find((trend) => trend.tag === "#alice")?.count).toBe(
			550,
		);
	});

	it("おすすめユーザーは自分とフォロー済みを除外する", async () => {
		const currentUser = await createUser();

		await db.insert(schema.user).values([
			{
				id: "discover_user_followed",
				name: "Followed User",
				email: "followed@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
			{
				id: "discover_user_a",
				name: "Suggested User A",
				email: "suggested-a@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-02"),
				updatedAt: new Date("2026-01-02"),
			},
			{
				id: "discover_user_b",
				name: "Suggested User B",
				email: "suggested-b@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-03"),
				updatedAt: new Date("2026-01-03"),
			},
			{
				id: "discover_user_c",
				name: "Suggested User C",
				email: "suggested-c@example.com",
				emailVerified: true,
				createdAt: new Date("2026-01-04"),
				updatedAt: new Date("2026-01-04"),
			},
		]);

		await db.insert(schema.follows).values({
			id: "discover_follow_id",
			followerId: currentUser.id,
			followingId: "discover_user_followed",
			createdAt: new Date(),
		});

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			suggestedUsers: Array<{ id: string }>;
		};

		expect(response.status).toBe(200);
		expect(json.suggestedUsers.some((user) => user.id === currentUser.id)).toBe(
			false,
		);
		expect(
			json.suggestedUsers.some((user) => user.id === "discover_user_followed"),
		).toBe(false);
		expect(json.suggestedUsers.length).toBeGreaterThan(0);
	});
});
