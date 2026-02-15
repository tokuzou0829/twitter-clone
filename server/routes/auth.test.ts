import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BlobFile, FileId, UploadedFile } from "@/server/objects/file";
import { setup } from "@/tests/vitest.helper";
import app from "./auth";

const { mock, createUser, db } = await setup();
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
				bucket: "techjam2026winter",
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
			const json = await response.json();
			expect(json).toMatchInlineSnapshot(`
				{
				  "session": {
				    "createdAt": "2026-01-01T00:00:00.000Z",
				    "expiresAt": "2026-01-01T01:00:00.000Z",
				    "id": "test_session_id",
				    "token": "test_token",
				    "updatedAt": "2026-01-01T00:00:00.000Z",
				    "userId": "test_user_id",
				  },
				  "user": {
				    "createdAt": "2026-01-01T00:00:00.000Z",
				    "email": "test@example.com",
				    "emailVerified": true,
				    "id": "test_user_id",
				    "image": "https://example.com/avatar.png",
				    "name": "Test User",
				    "updatedAt": "2026-01-01T00:00:00.000Z",
				  },
				}
			`);
			expect(response.status).toBe(200);
		});
	});
});
