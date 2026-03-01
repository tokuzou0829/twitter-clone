import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./discover";

const { createUser, db } = await setup();

describe("/routes/discover", () => {
	const fixedDate = new Date("2026-01-10T10:00:00.000Z");
	const oldDate = new Date("2025-12-31T10:00:00.000Z");

	it("直近投稿のハッシュタグからトレンドを返す", async () => {
		const userA = await createUser();
		const userB = await createUser();

		await db.insert(schema.posts).values([
			{
				id: "discover_post_1",
				authorId: userA.id,
				content: "Working with #NextJS and #TypeScript",
				createdAt: fixedDate,
				updatedAt: fixedDate,
			},
			{
				id: "discover_post_2",
				authorId: userB.id,
				content: "Shipped feature using #nextjs",
				createdAt: fixedDate,
				updatedAt: fixedDate,
			},
			{
				id: "discover_post_old",
				authorId: userA.id,
				content: "Old topic #legacy",
				createdAt: oldDate,
				updatedAt: oldDate,
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

	it("トレンド集計は500件超を読みつつ、単一ユーザー連投を抑制する", async () => {
		const userA = await createUser();
		const userB = await createUser();

		await db.insert(schema.posts).values([
			...Array.from({ length: 550 }, (_, index) => ({
				id: `discover_post_many_a_${index}`,
				authorId: userA.id,
				content: "bulk #alice",
				createdAt: fixedDate,
				updatedAt: fixedDate,
			})),
			...Array.from({ length: 30 }, (_, index) => ({
				id: `discover_post_many_b_${index}`,
				authorId: userB.id,
				content: "bulk #alice",
				createdAt: fixedDate,
				updatedAt: fixedDate,
			})),
		]);

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			trends: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.trends.find((trend) => trend.tag === "#alice")?.count).toBe(10);
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
			createdAt: fixedDate,
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
