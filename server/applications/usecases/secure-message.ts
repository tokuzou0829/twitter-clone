import type { SaveBlobFileService } from "@/server/infrastructure/repositories/file/interface";
import { createBlobFile } from "@/server/objects/file";

export const createSecureMessageWrokflow =
	(saveBlobFile: SaveBlobFileService) =>
	async (message: string, user: { id: string }) => {
		const file = createBlobFile({
			blob: new Blob([message], { type: "text/plain" }),
			bucket: "techjam2026winter",
			keyPrefix: user.id,
			contentType: "text/plain",
		});

		const savedFile = await saveBlobFile(file);
		return savedFile;
	};
