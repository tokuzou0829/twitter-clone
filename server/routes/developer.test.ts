import { eq } from "drizzle-orm";
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

	it("いいねとリポストをBearerトークンで切り替えできる", async () => {
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

		expect(likeResponse.status).toBe(200);
		expect(liked.liked).toBe(true);
		expect(liked.likes).toBe(1);
		expect(unlikeResponse.status).toBe(200);
		expect(unliked.liked).toBe(false);
		expect(unliked.likes).toBe(0);

		expect(repostResponse.status).toBe(200);
		expect(reposted.reposted).toBe(true);
		expect(reposted.reposts).toBe(1);
		expect(unrepostResponse.status).toBe(200);
		expect(unreposted.reposted).toBe(false);
		expect(unreposted.reposts).toBe(0);
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
