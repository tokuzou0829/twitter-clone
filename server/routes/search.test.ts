import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { setup } from "@/tests/vitest.helper";
import app from "./search";

const { createUser, db } = await setup();

describe("/routes/search", () => {
	it("未ログイン時はメンション候補を取得できない", async () => {
		const response = await app.request("/mentions?q=al", {
			method: "GET",
		});

		expect(response.status).toBe(401);
	});

	it("投稿本文とハッシュタグを検索できる", async () => {
		const user = await createUser();

		await db.insert(schema.posts).values([
			{
				id: "search_post_a",
				authorId: user.id,
				content: "Building with TypeScript and #TypeScript",
				createdAt: new Date("2026-01-01T10:00:00Z"),
				updatedAt: new Date("2026-01-01T10:00:00Z"),
			},
			{
				id: "search_post_b",
				authorId: user.id,
				content: "Another post about #typescript and DX",
				createdAt: new Date("2026-01-01T10:01:00Z"),
				updatedAt: new Date("2026-01-01T10:01:00Z"),
			},
			{
				id: "search_post_c",
				authorId: user.id,
				content: "No related keyword here #design",
				createdAt: new Date("2026-01-01T10:02:00Z"),
				updatedAt: new Date("2026-01-01T10:02:00Z"),
			},
		]);

		const response = await app.request("/?q=typescript", {
			method: "GET",
		});
		const json = (await response.json()) as {
			query: string;
			posts: Array<{ id: string }>;
			hashtags: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.query).toBe("typescript");
		expect(json.posts.some((post) => post.id === "search_post_a")).toBe(true);
		expect(json.posts.some((post) => post.id === "search_post_b")).toBe(true);
		expect(
			json.hashtags.find((item) => item.tag === "#typescript")?.count,
		).toBe(2);
	});

	it("ハッシュタグ検索は部分一致ではなくタグ一致でヒットする", async () => {
		const user = await createUser();

		await db.insert(schema.posts).values([
			{
				id: "search_exact_tag_post_a",
				authorId: user.id,
				content: "気分は #alice です",
				createdAt: new Date("2026-01-02T09:59:00Z"),
				updatedAt: new Date("2026-01-02T09:59:00Z"),
			},
			{
				id: "search_exact_tag_post_b",
				authorId: user.id,
				content: "これは #aliceは政府の陰謀 です",
				createdAt: new Date("2026-01-02T10:00:00Z"),
				updatedAt: new Date("2026-01-02T10:00:00Z"),
			},
		]);

		const response = await app.request("/?q=%23alice", {
			method: "GET",
		});
		const json = (await response.json()) as {
			posts: Array<{ id: string }>;
			hashtags: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.posts.map((post) => post.id)).toEqual([
			"search_exact_tag_post_a",
		]);
		expect(json.hashtags).toEqual([{ tag: "#alice", count: 1 }]);
	});

	it("複数ハッシュタグを指定した検索ができる", async () => {
		const user = await createUser();

		await db.insert(schema.posts).values([
			{
				id: "search_multi_tag_post_a",
				authorId: user.id,
				content: "Shipped feature with #NextJS and #TypeScript",
				createdAt: new Date("2026-01-02T10:00:00Z"),
				updatedAt: new Date("2026-01-02T10:00:00Z"),
			},
			{
				id: "search_multi_tag_post_b",
				authorId: user.id,
				content: "Only one tag #TypeScript",
				createdAt: new Date("2026-01-02T10:01:00Z"),
				updatedAt: new Date("2026-01-02T10:01:00Z"),
			},
			{
				id: "search_multi_tag_post_c",
				authorId: user.id,
				content: "Another topic with #NextJS",
				createdAt: new Date("2026-01-02T10:02:00Z"),
				updatedAt: new Date("2026-01-02T10:02:00Z"),
			},
		]);

		const response = await app.request("/?q=%23typescript%20%23nextjs", {
			method: "GET",
		});
		const json = (await response.json()) as {
			posts: Array<{ id: string }>;
			hashtags: Array<{ tag: string; count: number }>;
		};

		expect(response.status).toBe(200);
		expect(json.posts.map((post) => post.id)).toEqual([
			"search_multi_tag_post_a",
		]);
		expect(
			json.hashtags.find((hashtag) => hashtag.tag === "#typescript")?.count,
		).toBe(1);
		expect(
			json.hashtags.find((hashtag) => hashtag.tag === "#nextjs")?.count,
		).toBe(1);
	});

	it("空クエリの場合は空配列を返す", async () => {
		await createUser();

		const response = await app.request("/", {
			method: "GET",
		});
		const json = (await response.json()) as {
			query: string;
			posts: unknown[];
			users: unknown[];
			hashtags: unknown[];
		};

		expect(response.status).toBe(200);
		expect(json.query).toBe("");
		expect(json.posts).toEqual([]);
		expect(json.users).toEqual([]);
		expect(json.hashtags).toEqual([]);
	});

	it("ユーザーを名前・ハンドルで検索できる", async () => {
		await createUser();
		await db.insert(schema.user).values({
			id: "user_alice",
			name: "Alice Smith",
			handle: "alice",
			email: "alice@example.com",
			emailVerified: true,
			isBanned: false,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		});

		const byName = await app.request("/?q=Alice", { method: "GET" });
		const byNameJson = (await byName.json()) as {
			query: string;
			users: Array<{ id: string; name: string; handle: string | null }>;
		};
		expect(byName.status).toBe(200);
		expect(
			byNameJson.users.some(
				(u) => u.id === "user_alice" && u.name === "Alice Smith",
			),
		).toBe(true);

		const byHandle = await app.request("/?q=alice", { method: "GET" });
		const byHandleJson = (await byHandle.json()) as {
			users: Array<{ id: string; handle: string | null }>;
		};
		expect(byHandle.status).toBe(200);
		expect(
			byHandleJson.users.some(
				(u) => u.id === "user_alice" && u.handle === "alice",
			),
		).toBe(true);
	});

	it("ログイン時はメンション候補をハンドル前方一致で取得できる", async () => {
		await createUser();
		await db.insert(schema.user).values([
			{
				id: "mention_user_alice",
				name: "Alice Mention",
				handle: "alice_mention",
				email: "mention-alice@example.com",
				emailVerified: true,
				isBanned: false,
				createdAt: new Date("2026-01-01"),
				updatedAt: new Date("2026-01-01"),
			},
			{
				id: "mention_user_bob",
				name: "Bob Mention",
				handle: "bob_mention",
				email: "mention-bob@example.com",
				emailVerified: true,
				isBanned: false,
				createdAt: new Date("2026-01-02"),
				updatedAt: new Date("2026-01-02"),
			},
			{
				id: "mention_user_banned",
				name: "Banned Mention",
				handle: "alice_banned",
				email: "mention-banned@example.com",
				emailVerified: true,
				isBanned: true,
				createdAt: new Date("2026-01-03"),
				updatedAt: new Date("2026-01-03"),
			},
		]);

		const response = await app.request("/mentions?q=alice", {
			method: "GET",
		});
		const json = (await response.json()) as {
			users: Array<{ id: string; handle: string | null }>;
		};

		expect(response.status).toBe(200);
		expect(
			json.users.some(
				(user) =>
					user.id === "mention_user_alice" && user.handle === "alice_mention",
			),
		).toBe(true);
		expect(json.users.some((user) => user.id === "mention_user_bob")).toBe(
			false,
		);
		expect(json.users.some((user) => user.id === "mention_user_banned")).toBe(
			false,
		);
	});

	it("BAN済みユーザーは検索結果に含まれない", async () => {
		await createUser();
		await db.insert(schema.user).values({
			id: "user_banned",
			name: "Banned User",
			handle: "banned",
			email: "banned@example.com",
			emailVerified: true,
			isBanned: true,
			createdAt: new Date("2026-01-01"),
			updatedAt: new Date("2026-01-01"),
		});

		const response = await app.request("/?q=Banned", { method: "GET" });
		const json = (await response.json()) as {
			users: Array<{ id: string }>;
		};
		expect(response.status).toBe(200);
		expect(json.users.some((u) => u.id === "user_banned")).toBe(false);
	});
});
