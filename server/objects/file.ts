import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { ValidationError } from "@/server/errors";

export const createBlobFile = (params: {
	blob: Blob;
	bucket: string;
	keyPrefix: string;
	contentType: string;
}): BlobFile => {
	const { blob, bucket, keyPrefix, contentType } = params;
	const id = generateFileId();
	return {
		kind: "BlobFile",
		id,
		blob,
		bucket,
		key: `${keyPrefix}/${id}`,
		contentType,
	};
};

const generateFileId = (): FileId => {
	return uuidv7() as FileId;
};

const fileIdSchema = z.string().uuid().brand("FileId");

export type FileId = z.infer<typeof fileIdSchema>;
export type FileIdInput = z.input<typeof fileIdSchema>;

const FileId = Object.assign(
	(input: FileIdInput): FileId => buildFromZod(fileIdSchema.safeParse(input)),
	{
		schema: fileIdSchema,
		unsafe: (input: FileIdInput): FileId => fileIdSchema.parse(input),
	},
);

export interface BlobFile extends BaseFile {
	kind: "BlobFile";
	blob: Blob;
}
export interface BaseFile {
	kind: string;
	id: FileId;
	bucket: string;
	key: string;
	contentType: string;
}

/**
 * Zod の SafeParseReturnType を neverthrow の Result に変換する
 *
 * @example
 * ```ts
 * const result = buildFromZod(OrderQuantity.safeBuild(newValue));
 * // Result<OrderQuantity, ValidationError>
 * ```
 */

const buildFromZod = <Output>(result: z.ZodSafeParseResult<Output>): Output => {
	if (result.success) return result.data;
	throw new ValidationError(result.error.message);
};

export type UploadedFile<T extends BaseFile> = T & {
	size: number;
	uploadedAt: Date;
};

export const toUploadedFile = <T extends BaseFile>(params: {
	file: T;
	size: number;
}): UploadedFile<T> => {
	const { file, size } = params;
	return { ...file, size, uploadedAt: new Date() };
};
