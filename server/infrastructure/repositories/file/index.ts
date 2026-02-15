/**
 * Creates file repository functions
 * @param r2 - The R2 service
 * @param db - The database instance
 * @returns File repository functions
 */

import type { AwsClient } from "aws4fetch";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import type { BlobFile } from "@/server/objects/file";
import { toUploadedFile, type UploadedFile } from "@/server/objects/file";

export const createFileRepository = (
	r2: AwsClient,
	db: Database,
	url: string,
) => ({
	saveBlobFile: createSaveBlobFile(r2, db, url),
});

/**
 * Creates a function to save a blob file to storage
 * @param r2 - The R2 service
 * @param db - The database instance
 * @returns A function to save a blob file
 */
const createSaveBlobFile =
	(r2: AwsClient, db: Database, url: string) =>
	async <T extends BlobFile>(file: T): Promise<UploadedFile<T>> => {
		const uploadResponse = await r2.fetch(`${url}/${file.bucket}/${file.key}`, {
			method: "PUT",
			body: file.blob,
			headers: { "Content-Type": file.contentType },
		});
		const resjson = await uploadResponse.text();
		console.log("Upload Response JSON:", resjson);

		const size = file.blob.size;

		await db.insert(schema.files).values({
			id: file.id,
			bucket: file.bucket,
			key: file.key,
			contentType: file.contentType,
			size,
			expiresAt:
				"expiresAt" in file && file.expiresAt instanceof Date
					? file.expiresAt
					: null,
			uploadedAt: new Date(),
		});

		return toUploadedFile({ file, size });
	};
