import type { BlobFile, UploadedFile } from "@/server/objects/file";

export type SaveBlobFileService = <T extends BlobFile>(
	file: T,
) => Promise<UploadedFile<T>>;
