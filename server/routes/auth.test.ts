import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { createAutoUserHandleFromUserId } from "@/lib/user-handle";
import type { BlobFile, FileId, UploadedFile } from "@/server/objects/file";
import { setup } from "@/tests/vitest.helper";
import app from "./auth";

const { createUser, db } = await setup();
const { saveBlobFile } = vi.hoisted(() => ({
	saveBlobFile: vi.fn(),
}));

describe("/routes/auth", () => {
	describe("POST /secure-message", () => {
		beforeEach(async () => {
			vi.mock("../infrastructure/repositories/file", async (actual) => {
				return {
					...(await actual<
						typeof import("../infrastructure/repositories/file")
					>()),
					createFileRepository: vi.fn(() => {
						return {
							saveBlobFile,
						};
					}),
				};
			});
		});
		it("未ログイン時はAPIに到達できない", async () => {
			const response = await app.request("/secure-message", {
				method: "POST",
				body: JSON.stringify({ message: "Hello, World!" }),
				headers: { "Content-Type": "application/json" },
			});
			const json = await response.json();
			expect(json).toMatchInlineSnapshot(`
				{
				  "error": "Unauthorized",
				}
			`);
			expect(response.status).toBe(401);
		});
		it("ログイン時はセキュアメッセージを保存できる", async () => {
			await createUser();
			const fakeSavedFile: UploadedFile<BlobFile> = {
				id: "file_123" as FileId,
				bucket: "vantan-bbs-twitter-clone",
				contentType: "text/plain",
				key: "secure-messages/file_123",
				kind: "BlobFile",
				blob: new Blob(["hello"], { type: "text/plain" }),
				size: 5,
				uploadedAt: new Date("2026-01-01"),
			};

			saveBlobFile.mockResolvedValueOnce(fakeSavedFile);

			const res = await app.request("/secure-message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: "hello" }),
			});
			const json = await res.json();
			expect(json).toMatchInlineSnapshot(`
				{
				  "message": "Hello Test User, hello",
				}
			`);
			expect(saveBlobFile).toHaveBeenCalledTimes(1);
			expect(saveBlobFile.mock.calls).toMatchObject([
				[
					{
						contentType: "text/plain",
						kind: "BlobFile",
					},
				],
			]);
			expect(res.status).toBe(200);
		});
	});
	describe("GET /me", () => {
		it("未ログイン時はAPIに到達できない", async () => {
			const response = await app.request("/me", {
				method: "GET",
			});
			const json = await response.json();
			expect(json).toMatchInlineSnapshot(`
				{
				  "error": "Unauthorized",
				}
			`);
			expect(response.status).toBe(401);
		});
		it("ログイン時はユーザー情報を取得できる", async () => {
			await createUser();
			const response = await app.request("/me", {
				method: "GET",
			});
			const json = (await response.json()) as {
				session: {
					id: string;
					userId: string;
					token: string;
				};
				user: {
					id: string;
					email: string;
					name: string;
					isDeveloper: boolean;
				};
			};

			expect(json.session.id).toBe("test_session_id");
			expect(json.session.userId).toBe("test_user_id");
			expect(json.session.token).toBe("test_token");
			expect(json.user.id).toBe("test_user_id");
			expect(json.user.email).toBe("test@example.com");
			expect(json.user.name).toBe("Test User");
			expect(json.user.isDeveloper).toBe(false);
			expect(response.status).toBe(200);
		});
	});

	describe("POST /sign-up/email", () => {
		it("初回登録時にユーザーIDからハンドルが自動採番される", async () => {
			const response = await app.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					name: "Signup Handle User",
					email: "signup-handle@example.com",
					password: "password1234",
				}),
			});
			const json = (await response.json()) as {
				user: {
					id: string;
					handle: string | null;
				};
			};

			expect(response.status).toBe(200);
			expect(json.user.handle).toBe(
				createAutoUserHandleFromUserId(json.user.id),
			);
		});

		it("同一IPからのアカウント作成はレートリミットされる", async () => {
			for (let index = 0; index < 5; index += 1) {
				const response = await app.request("/api/auth/sign-up/email", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						origin: "http://localhost:3000",
						"x-forwarded-for": "203.0.113.9",
					},
					body: JSON.stringify({
						name: `RateLimit User ${index}`,
						email: `signup-rate-${index}@example.com`,
						password: "password1234",
					}),
				});

				expect(response.status).toBe(200);
			}

			const blockedResponse = await app.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					origin: "http://localhost:3000",
					"x-forwarded-for": "203.0.113.9",
				},
				body: JSON.stringify({
					name: "RateLimit User Blocked",
					email: "signup-rate-blocked@example.com",
					password: "password1234",
				}),
			});

			expect(blockedResponse.status).toBe(429);
		});

		it("BAN済みユーザーはサインインできない", async () => {
			const email = "banned-signin@example.com";
			const password = "password1234";

			const signUpResponse = await app.request("/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					name: "Banned User",
					email,
					password,
				}),
			});
			const signedUp = (await signUpResponse.json()) as {
				user: {
					id: string;
				};
			};

			await db
				.update(schema.user)
				.set({
					isBanned: true,
					updatedAt: new Date("2026-01-01"),
				})
				.where(eq(schema.user.id, signedUp.user.id));

			const signInResponse = await app.request("/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email,
					password,
				}),
			});

			expect(signUpResponse.status).toBe(200);
			expect(signInResponse.status).toBe(401);
		});
	});
});
