import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostSummary } from "@/lib/social-api";
import OpenGraphImage from "./opengraph-image";

const createPost = (content: string): PostSummary => ({
	id: "post_og_test",
	content,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	replyToPostId: null,
	quotePostId: null,
	author: {
		id: "user_og_test",
		name: "Tester",
		handle: "tester",
		image: null,
		bio: null,
		bannerImage: null,
	},
	images: [],
	links: [],
	mentions: [],
	quotePost: null,
	stats: {
		likes: 0,
		reposts: 0,
		replies: 0,
		quotes: 0,
	},
	viewer: {
		liked: false,
		reposted: false,
		followingAuthor: false,
	},
});

afterEach(() => {
	vi.restoreAllMocks();
});

const mockPostApi = (post: PostSummary) => {
	const originalFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;
		if (url.includes(`/api/posts/${post.id}`)) {
			return new Response(JSON.stringify({ post }), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			});
		}
		return originalFetch(input, init);
	});
};

describe("post OG image", () => {
	it("アラビア語を含む投稿でも画像プレビューを生成できる", async () => {
		const post = createPost("مرحبا بالعالم هذا اختبار معاينة");
		mockPostApi(post);

		const response = await OpenGraphImage({
			params: Promise.resolve({ postId: post.id }),
		});
		const body = await response.arrayBuffer();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("image/png");
		expect(body.byteLength).toBeGreaterThan(0);
	});

	it("非アラビア語投稿でも画像プレビューを生成できる", async () => {
		const post = createPost("hello preview");
		mockPostApi(post);

		const response = await OpenGraphImage({
			params: Promise.resolve({ postId: post.id }),
		});
		const body = await response.arrayBuffer();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("image/png");
		expect(body.byteLength).toBeGreaterThan(0);
	});

	it.each([
		"日本語の投稿プレビュー確認",
		"한국어 미리보기 테스트",
		"Превью поста на русском",
		"हिंदी पोस्ट प्रीव्यू परीक्षण",
		"ทดสอบพรีวิวภาษาไทย",
		"中文帖子预览测试",
	])("多言語テキストを含む投稿でも画像プレビューを生成できる: %s", async (content) => {
		const post = createPost(content);
		mockPostApi(post);

		const response = await OpenGraphImage({
			params: Promise.resolve({ postId: post.id }),
		});
		const body = await response.arrayBuffer();

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("image/png");
		expect(body.byteLength).toBeGreaterThan(0);
	});
});
