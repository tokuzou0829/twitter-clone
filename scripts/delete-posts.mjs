#!/usr/bin/env node

import { parseArgs } from "node:util";
import { AwsClient } from "aws4fetch";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const HELP_TEXT = `Delete posts by content substring and/or author id.

Usage:
  pnpm posts:delete -- --contains "<text>" [--author-id "<id>"] [--limit <n>] [--apply]
  pnpm posts:delete -- --author-id "<id>" [--limit <n>] [--apply]

Options:
  --contains <text>     Match posts whose content includes <text> (case-sensitive)
  --author-id <id>      Match posts by exact author id
  --limit <n>           Maximum number of matched posts to process
  --apply               Execute deletion (default is dry-run)
  --help                Show this help message

Rules:
  - At least one of --contains or --author-id is required
  - If both are specified, matching is AND
  - Without --apply, this command does not delete data
`;

const main = async () => {
	loadEnv({ path: ".env.local", override: false, quiet: true });
	loadEnv({ path: ".env", override: false, quiet: true });

	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

	const { values } = parseArgs({
		args,
		options: {
			contains: { type: "string" },
			"author-id": { type: "string" },
			limit: { type: "string" },
			apply: { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
		strict: true,
		allowPositionals: false,
	});

	if (values.help) {
		console.log(HELP_TEXT);
		return;
	}

	const contains = normalizeOptionalString(values.contains);
	const authorId = normalizeOptionalString(values["author-id"]);
	const limit = parseOptionalPositiveInt(values.limit, "--limit");
	const apply = values.apply;

	if (!contains && !authorId) {
		throw new Error("Specify at least one filter: --contains or --author-id");
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = postgres(databaseUrl, { prepare: false });

	try {
		const targetPosts = await loadTargetPosts(sql, {
			contains,
			authorId,
			limit,
		});

		printMatchSummary({
			targetPosts,
			contains,
			authorId,
			limit,
			apply,
		});

		if (!apply || targetPosts.length === 0) {
			if (!apply) {
				console.log(
					"\nDry-run only. Re-run with --apply to delete matched posts.",
				);
			}
			return;
		}

		const r2Context = createR2ContextFromEnv();
		if (!r2Context) {
			console.warn(
				"[warn] R2 config is incomplete. Post rows will be deleted, but file cleanup will be skipped.",
			);
		}

		const result = await deleteMatchedPosts(sql, targetPosts, r2Context);
		printDeleteSummary(result);

		if (result.failedPostIds.length > 0) {
			process.exitCode = 1;
		}
	} finally {
		await sql.end({ timeout: 5 });
	}
};

const loadTargetPosts = async (sql, filters) => {
	const limitClause =
		typeof filters.limit === "number" ? sql`LIMIT ${filters.limit}` : sql``;
	const escapedContains = filters.contains
		? `%${escapeLikePattern(filters.contains)}%`
		: null;

	if (escapedContains && filters.authorId) {
		return await sql`
			SELECT
				id,
				author_id AS "authorId",
				content,
				created_at AS "createdAt"
			FROM posts
			WHERE content LIKE ${escapedContains} ESCAPE '\\'
				AND author_id = ${filters.authorId}
			ORDER BY created_at ASC
			${limitClause}
		`;
	}

	if (escapedContains) {
		return await sql`
			SELECT
				id,
				author_id AS "authorId",
				content,
				created_at AS "createdAt"
			FROM posts
			WHERE content LIKE ${escapedContains} ESCAPE '\\'
			ORDER BY created_at ASC
			${limitClause}
		`;
	}

	if (filters.authorId) {
		return await sql`
			SELECT
				id,
				author_id AS "authorId",
				content,
				created_at AS "createdAt"
			FROM posts
			WHERE author_id = ${filters.authorId}
			ORDER BY created_at ASC
			${limitClause}
		`;
	}

	return await sql`
		SELECT
			id,
			author_id AS "authorId",
			content,
			created_at AS "createdAt"
		FROM posts
		ORDER BY created_at ASC
		${limitClause}
	`;
};

const deleteMatchedPosts = async (sql, targetPosts, r2Context) => {
	const deletedPostIds = [];
	const skippedPostIds = [];
	const failedPostIds = [];
	let fileDeleteFailures = 0;
	let fileDeleteSkipped = 0;

	for (const targetPost of targetPosts) {
		try {
			const deleted = await sql.begin(async (tx) => {
				const [currentPost] = await tx`
					SELECT reply_to_post_id AS "replyToPostId"
					FROM posts
					WHERE id = ${targetPost.id}
					LIMIT 1
				`;

				if (!currentPost) {
					return null;
				}

				const imageRows = await tx`
					SELECT file_id AS "fileId"
					FROM post_images
					WHERE post_id = ${targetPost.id}
				`;

				await tx`
					UPDATE posts
					SET
						reply_to_post_id = ${currentPost.replyToPostId ?? null},
						updated_at = NOW()
					WHERE reply_to_post_id = ${targetPost.id}
				`;

				const [deletedPost] = await tx`
					DELETE FROM posts
					WHERE id = ${targetPost.id}
					RETURNING id
				`;

				if (!deletedPost) {
					return null;
				}

				return {
					id: targetPost.id,
					fileIds: [...new Set(imageRows.map((imageRow) => imageRow.fileId))],
				};
			});

			if (!deleted) {
				skippedPostIds.push(targetPost.id);
				continue;
			}

			deletedPostIds.push(targetPost.id);

			for (const fileId of deleted.fileIds) {
				if (!r2Context) {
					fileDeleteSkipped += 1;
					continue;
				}

				try {
					await deleteFileById(sql, r2Context, fileId);
				} catch (error) {
					fileDeleteFailures += 1;
					console.warn(
						`[warn] file cleanup failed for ${fileId}: ${toErrorMessage(error)}`,
					);
				}
			}
		} catch (error) {
			failedPostIds.push(targetPost.id);
			console.error(
				`[error] failed to delete post ${targetPost.id}: ${toErrorMessage(error)}`,
			);
		}
	}

	return {
		deletedPostIds,
		skippedPostIds,
		failedPostIds,
		fileDeleteFailures,
		fileDeleteSkipped,
	};
};

const deleteFileById = async (sql, r2Context, fileId) => {
	const [targetFile] = await sql`
		SELECT id, bucket, "key"
		FROM files
		WHERE id = ${fileId}
		LIMIT 1
	`;

	if (!targetFile) {
		return;
	}

	const response = await r2Context.client.fetch(
		toObjectUrl(r2Context.baseUrl, targetFile.bucket, targetFile.key),
		{
			method: "DELETE",
			body: new Uint8Array(0),
			headers: {
				"Content-Length": "0",
			},
		},
	);

	if (!response.ok && response.status !== 404) {
		throw new Error(
			`Failed to delete file from R2: ${response.status} ${response.statusText}`,
		);
	}

	await sql`
		DELETE FROM files
		WHERE id = ${fileId}
	`;
};

const createR2ContextFromEnv = () => {
	const accessKeyId = process.env.R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
	const baseUrl = process.env.R2_S3_URL;

	if (!accessKeyId || !secretAccessKey || !baseUrl) {
		return null;
	}

	return {
		client: new AwsClient({
			service: "s3",
			region: "auto",
			accessKeyId,
			secretAccessKey,
		}),
		baseUrl,
	};
};

const toObjectUrl = (baseUrl, bucket, key) => {
	const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
	const endpoint = new URL(normalizedBaseUrl);
	const isVirtualHostedStyle = endpoint.hostname
		.toLowerCase()
		.startsWith(`${bucket.toLowerCase()}.`);
	const objectPath = isVirtualHostedStyle ? key : `${bucket}/${key}`;

	return new URL(objectPath, normalizedBaseUrl).toString();
};

const normalizeOptionalString = (value) => {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized ? normalized : null;
};

const parseOptionalPositiveInt = (value, optionName) => {
	if (value === undefined) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${optionName} must be a positive integer`);
	}

	return parsed;
};

const escapeLikePattern = (value) => {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("%", "\\%")
		.replaceAll("_", "\\_");
};

const printMatchSummary = (params) => {
	const filters = [];
	if (params.contains) {
		filters.push(`contains=${JSON.stringify(params.contains)}`);
	}
	if (params.authorId) {
		filters.push(`authorId=${JSON.stringify(params.authorId)}`);
	}

	console.log("Post deletion target preview");
	console.log(`- mode: ${params.apply ? "apply" : "dry-run"}`);
	console.log(`- filters: ${filters.join(" AND ")}`);
	if (params.limit) {
		console.log(`- limit: ${params.limit}`);
	}
	console.log(`- matched posts: ${params.targetPosts.length}`);

	if (params.targetPosts.length === 0) {
		return;
	}

	const previewLimit = 20;
	const preview = params.targetPosts.slice(0, previewLimit);
	console.log("- preview:");
	for (const post of preview) {
		const createdAt =
			post.createdAt instanceof Date
				? post.createdAt.toISOString()
				: String(post.createdAt);
		console.log(
			`  - ${post.id} | author=${post.authorId} | createdAt=${createdAt}`,
		);
	}

	if (params.targetPosts.length > previewLimit) {
		console.log(`  - ...and ${params.targetPosts.length - previewLimit} more`);
	}
};

const printDeleteSummary = (result) => {
	console.log("\nDeletion completed");
	console.log(`- deleted posts: ${result.deletedPostIds.length}`);
	console.log(`- skipped posts: ${result.skippedPostIds.length}`);
	console.log(`- failed posts: ${result.failedPostIds.length}`);
	console.log(`- file cleanup failures: ${result.fileDeleteFailures}`);
	console.log(`- file cleanup skipped: ${result.fileDeleteSkipped}`);

	if (result.failedPostIds.length > 0) {
		console.log(`- failed post ids: ${result.failedPostIds.join(", ")}`);
	}
};

const toErrorMessage = (error) => {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
};

void main().catch((error) => {
	console.error(`[error] ${toErrorMessage(error)}`);
	process.exit(1);
});
