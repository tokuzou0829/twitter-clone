#!/usr/bin/env node

import { parseArgs } from "node:util";
import { AwsClient } from "aws4fetch";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const HELP_TEXT = `Delete users by name substring.

Usage:
  pnpm users:delete -- --name-contains "<text>" [--limit <n>] [--concurrency <n>] [--apply]

Options:
  --name-contains <text> Match users whose name includes <text> (case-insensitive)
  --limit <n>            Maximum number of matched users to process
  --concurrency <n>      Number of parallel workers (default: 10, max: 100)
  --apply                Execute deletion (default is dry-run)
  --help                 Show this help message

Rules:
  - --name-contains is required
  - --concurrency applies to both user and file deletion
  - Without --apply, this command does not delete data
`;

const DEFAULT_CONCURRENCY = 10;
const MAX_CONCURRENCY = 100;
const TRANSACTION_MAX_RETRIES = 3;
const PREVIEW_LIMIT = 20;

const main = async () => {
	loadEnv({ path: ".env.local", override: false, quiet: true });
	loadEnv({ path: ".env", override: false, quiet: true });

	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

	const { values } = parseArgs({
		args,
		options: {
			"name-contains": { type: "string" },
			limit: { type: "string" },
			concurrency: { type: "string" },
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

	const nameContains = normalizeRequiredString(
		values["name-contains"],
		"--name-contains",
	);
	const limit = parseOptionalPositiveInt(values.limit, "--limit");
	const concurrency = resolveConcurrency(values.concurrency);
	const apply = values.apply;

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = postgres(databaseUrl, { prepare: false });

	try {
		const targetUsers = await loadTargetUsers(sql, {
			nameContains,
			limit,
		});

		printMatchSummary({
			targetUsers,
			nameContains,
			limit,
			concurrency,
			apply,
		});

		if (!apply || targetUsers.length === 0) {
			if (!apply) {
				console.log(
					"\nDry-run only. Re-run with --apply to delete matched users.",
				);
			}
			return;
		}

		const r2Context = createR2ContextFromEnv();
		if (!r2Context) {
			console.warn(
				"[warn] R2 config is incomplete. User rows will be deleted, but file cleanup will be skipped.",
			);
		}

		const result = await deleteMatchedUsers(
			sql,
			targetUsers,
			r2Context,
			concurrency,
		);
		printDeleteSummary(result);

		if (result.failedUserIds.length > 0) {
			process.exitCode = 1;
		}
	} finally {
		await sql.end({ timeout: 5 });
	}
};

const loadTargetUsers = async (sql, filters) => {
	const limitClause =
		typeof filters.limit === "number" ? sql`LIMIT ${filters.limit}` : sql``;
	const escapedContains = `%${escapeLikePattern(filters.nameContains)}%`;

	return await sql`
		SELECT
			id,
			name,
			handle,
			created_at AS "createdAt"
		FROM "user"
		WHERE name ILIKE ${escapedContains} ESCAPE '\\'
		ORDER BY created_at ASC
		${limitClause}
	`;
};

const deleteMatchedUsers = async (sql, targetUsers, r2Context, concurrency) => {
	const deletedUserIds = [];
	const skippedUserIds = [];
	const failedUserIds = [];
	const fileIdsToDelete = new Set();
	let fileDeleteFailures = 0;
	let fileDeleteSkipped = 0;

	const userResults = await mapWithConcurrency(
		targetUsers,
		concurrency,
		async (targetUser) => {
			try {
				const deleted = await deleteSingleUser(sql, targetUser);
				if (!deleted) {
					return { status: "skipped", userId: targetUser.id };
				}

				return {
					status: "deleted",
					userId: targetUser.id,
					fileIds: deleted.fileIds,
				};
			} catch (error) {
				return {
					status: "failed",
					userId: targetUser.id,
					error,
				};
			}
		},
	);

	for (const result of userResults) {
		if (!result) {
			continue;
		}

		if (result.status === "deleted") {
			deletedUserIds.push(result.userId);
			for (const fileId of result.fileIds) {
				fileIdsToDelete.add(fileId);
			}
			continue;
		}

		if (result.status === "skipped") {
			skippedUserIds.push(result.userId);
			continue;
		}

		failedUserIds.push(result.userId);
		console.error(
			`[error] failed to delete user ${result.userId}: ${toErrorMessage(result.error)}`,
		);
	}

	const fileIds = [...fileIdsToDelete];
	if (!r2Context) {
		fileDeleteSkipped = fileIds.length;
	} else {
		const fileResults = await mapWithConcurrency(
			fileIds,
			concurrency,
			async (fileId) => {
				try {
					await deleteFileById(sql, r2Context, fileId);
					return { status: "deleted", fileId };
				} catch (error) {
					return {
						status: "failed",
						fileId,
						error,
					};
				}
			},
		);

		for (const result of fileResults) {
			if (!result || result.status !== "failed") {
				continue;
			}

			fileDeleteFailures += 1;
			console.warn(
				`[warn] file cleanup failed for ${result.fileId}: ${toErrorMessage(result.error)}`,
			);
		}
	}

	return {
		deletedUserIds,
		skippedUserIds,
		failedUserIds,
		fileDeleteFailures,
		fileDeleteSkipped,
	};
};

const deleteSingleUser = async (sql, targetUser) => {
	for (let attempt = 0; attempt < TRANSACTION_MAX_RETRIES; attempt += 1) {
		try {
			return await sql.begin(async (tx) => {
				const [currentUser] = await tx`
					SELECT
						id,
						avatar_file_id AS "avatarFileId",
						banner_file_id AS "bannerFileId"
					FROM "user"
					WHERE id = ${targetUser.id}
					FOR NO KEY UPDATE
				`;

				if (!currentUser) {
					return null;
				}

				const imageRows = await tx`
					SELECT post_images.file_id AS "fileId"
					FROM post_images
					INNER JOIN posts ON posts.id = post_images.post_id
					WHERE posts.author_id = ${targetUser.id}
				`;

				const [deletedUser] = await tx`
					DELETE FROM "user"
					WHERE id = ${targetUser.id}
					RETURNING id
				`;

				if (!deletedUser) {
					return null;
				}

				const fileIds = new Set(imageRows.map((imageRow) => imageRow.fileId));
				if (currentUser.avatarFileId) {
					fileIds.add(currentUser.avatarFileId);
				}
				if (currentUser.bannerFileId) {
					fileIds.add(currentUser.bannerFileId);
				}

				return {
					id: targetUser.id,
					fileIds: [...fileIds],
				};
			});
		} catch (error) {
			if (
				attempt < TRANSACTION_MAX_RETRIES - 1 &&
				isRetryableUserDeleteError(error)
			) {
				continue;
			}

			throw error;
		}
	}

	throw new Error("user deletion failed after retries");
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

const normalizeRequiredString = (value, optionName) => {
	if (typeof value !== "string") {
		throw new Error(`${optionName} is required`);
	}

	const normalized = value.trim();
	if (!normalized) {
		throw new Error(`${optionName} is required`);
	}

	return normalized;
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

const resolveConcurrency = (value) => {
	const parsed = parseOptionalPositiveInt(value, "--concurrency");
	const concurrency = parsed ?? DEFAULT_CONCURRENCY;

	if (concurrency > MAX_CONCURRENCY) {
		throw new Error(`--concurrency must be ${MAX_CONCURRENCY} or fewer`);
	}

	return concurrency;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
	if (items.length === 0) {
		return [];
	}

	const results = [];
	let nextIndex = 0;
	const workerCount = Math.min(concurrency, items.length);

	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (true) {
				const currentIndex = nextIndex;
				nextIndex += 1;

				if (currentIndex >= items.length) {
					return;
				}

				results[currentIndex] = await mapper(items[currentIndex], currentIndex);
			}
		}),
	);

	return results;
};

const escapeLikePattern = (value) => {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("%", "\\%")
		.replaceAll("_", "\\_");
};

const printMatchSummary = (params) => {
	console.log("User deletion target preview");
	console.log(`- mode: ${params.apply ? "apply" : "dry-run"}`);
	console.log(`- filter: nameContains=${JSON.stringify(params.nameContains)}`);
	if (params.limit) {
		console.log(`- limit: ${params.limit}`);
	}
	console.log(`- concurrency: ${params.concurrency}`);
	console.log(`- matched users: ${params.targetUsers.length}`);

	if (params.targetUsers.length === 0) {
		return;
	}

	console.log("- preview:");
	for (const user of params.targetUsers.slice(0, PREVIEW_LIMIT)) {
		const createdAt =
			user.createdAt instanceof Date
				? user.createdAt.toISOString()
				: String(user.createdAt);
		const handle = user.handle ?? "(none)";
		console.log(
			`  - ${user.id} | name=${JSON.stringify(user.name)} | handle=${handle} | createdAt=${createdAt}`,
		);
	}

	if (params.targetUsers.length > PREVIEW_LIMIT) {
		console.log(`  - ...and ${params.targetUsers.length - PREVIEW_LIMIT} more`);
	}
};

const printDeleteSummary = (result) => {
	console.log("\nDeletion completed");
	console.log(`- deleted users: ${result.deletedUserIds.length}`);
	console.log(`- skipped users: ${result.skippedUserIds.length}`);
	console.log(`- failed users: ${result.failedUserIds.length}`);
	console.log(`- file cleanup failures: ${result.fileDeleteFailures}`);
	console.log(`- file cleanup skipped: ${result.fileDeleteSkipped}`);

	if (result.failedUserIds.length > 0) {
		console.log(`- failed user ids: ${result.failedUserIds.join(", ")}`);
	}
};

const toErrorMessage = (error) => {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
};

const isRetryableUserDeleteError = (error) => {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = /** @type {{ code?: unknown }} */ (error);
	return candidate.code === "40P01" || candidate.code === "40001";
};

void main().catch((error) => {
	console.error(`[error] ${toErrorMessage(error)}`);
	process.exit(1);
});
