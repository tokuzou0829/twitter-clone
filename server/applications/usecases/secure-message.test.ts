import { describe, expect, it, vi } from "vitest";
import type { BlobFile, FileId, UploadedFile } from "@/server/objects/file";
import { createSecureMessageWrokflow } from "./secure-message";

describe("createSecureMessageWorkflow", () => {
	it("message を Blob として保存する", async () => {
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

		const saveBlobFile = vi.fn().mockResolvedValue(fakeSavedFile);

		const workflow = createSecureMessageWrokflow(saveBlobFile);

		const result = await workflow("hello", { id: "user_1" });

		expect(result).toMatchInlineSnapshot(`
			{
			  "blob": Blob {},
			  "bucket": "techjam2026winter",
			  "contentType": "text/plain",
			  "id": "file_123",
			  "key": "secure-messages/file_123",
			  "kind": "BlobFile",
			  "size": 5,
			  "uploadedAt": 2026-01-01T00:00:00.000Z,
			}
		`);
	});
});
