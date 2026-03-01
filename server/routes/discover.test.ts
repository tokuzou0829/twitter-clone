import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./discover";

const { createUser, db } = await setup();

describe("/routes/discover", () => {
	const recentDate = () => new Date(Date.now() - 60 * 60 * 1000);
	const expiredDate = () => new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

	it("直近投稿のハッシュタグからトレンドを返す", async () => {
		const createdAt = recentDate();
		const staleCreatedAt = expiredDate();

		await db.insert(schema.user).values([
			{
				id: "discover_trend_user_a",
				name: "Discover Trend User A",
				email: "discover-trend-user-a@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "discover_trend_user_b",
				name: "Discover Trend User B",
				email: "discover-trend-user-b@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
		]);

		await db.insert(schema.posts).values([
			{
				id: "discover_post_1",
				authorId: "discover_trend_user_a",
				content: "Working with #NextJS and #TypeScript",
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "discover_post_2",
				authorId: "discover_trend_user_b",
				content: "Shipped feature using #nextjs",
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "discover_post_old",
				authorId: "discover_trend_user_a",
				content: "Old topic #legacy",
				createdAt: staleCreatedAt,
				updatedAt: staleCreatedAt,
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

	it("単一ユーザー投稿のハッシュタグもトレンドに含まれる", async () => {
		const createdAt = recentDate();

		await db.insert(schema.user).values({
			id: "discover_single_author",
			name: "Discover Single Author",
			email: "discover-single-author@example.com",
			emailVerified: true,
			createdAt,
			updatedAt: createdAt,
		});

		await db.insert(schema.posts).values({
			id: "discover_single_author_post",
			authorId: "discover_single_author",
			content: "Single author tag #solotrend",
			createdAt,
			updatedAt: createdAt,
		});

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			trends: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.trends.find((trend) => trend.tag === "#solotrend")?.count).toBe(
			1,
		);
	});

	it("トレンド集計は500件超を読みつつ、連投を逓減スコアで扱う", async () => {
		const createdAt = recentDate();
		const diverseAuthorCount = 20;

		await db.insert(schema.user).values([
			{
				id: "discover_spam_author",
				name: "Discover Spam Author",
				email: "discover-spam-author@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
			...Array.from({ length: diverseAuthorCount }, (_, index) => ({
				id: `discover_diverse_author_${index}`,
				name: `Discover Diverse Author ${index}`,
				email: `discover-diverse-author-${index}@example.com`,
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			})),
		]);

		await db.insert(schema.posts).values([
			...Array.from({ length: 550 }, (_, index) => ({
				id: `discover_post_many_single_author_${index}`,
				authorId: "discover_spam_author",
				content: "bulk #aurora",
				createdAt,
				updatedAt: createdAt,
			})),
			...Array.from({ length: diverseAuthorCount }, (_, index) => ({
				id: `discover_post_many_diverse_author_${index}`,
				authorId: `discover_diverse_author_${index}`,
				content: "bulk #horizon",
				createdAt,
				updatedAt: createdAt,
			})),
		]);

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			trends: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.trends.find((trend) => trend.tag === "#aurora")?.count).toBe(
			550,
		);
		expect(json.trends.find((trend) => trend.tag === "#horizon")?.count).toBe(
			diverseAuthorCount,
		);

		const horizonIndex = json.trends.findIndex(
			(trend) => trend.tag === "#horizon",
		);
		const auroraIndex = json.trends.findIndex(
			(trend) => trend.tag === "#aurora",
		);

		expect(horizonIndex).toBeGreaterThanOrEqual(0);
		expect(auroraIndex).toBeGreaterThanOrEqual(0);
		expect(horizonIndex).toBeLessThan(auroraIndex);
	});

	it("おすすめユーザーは自分とフォロー済みを除外する", async () => {
		const currentUser = await createUser();
		const createdAt = recentDate();

		await db.insert(schema.user).values([
			{
				id: "discover_user_followed",
				name: "Followed User",
				email: "followed@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "discover_user_a",
				name: "Suggested User A",
				email: "suggested-a@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "discover_user_b",
				name: "Suggested User B",
				email: "suggested-b@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
			{
				id: "discover_user_c",
				name: "Suggested User C",
				email: "suggested-c@example.com",
				emailVerified: true,
				createdAt,
				updatedAt: createdAt,
			},
		]);

		await db.insert(schema.follows).values({
			id: "discover_follow_id",
			followerId: currentUser.id,
			followingId: "discover_user_followed",
			createdAt,
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
