#!/usr/bin/env node

import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const HELP_TEXT = `Ban or unban a user.

Usage:
  pnpm users:ban -- --user-id "<id>" [--apply]
  pnpm users:ban -- --user-id "<id>" --unban [--apply]

Options:
  --user-id <id>        Target user id
  --unban               Unban the target user (default is ban)
  --apply               Execute update (default is dry-run)
  --help                Show this help message

Rules:
  - Without --apply, this command does not update data
  - Ban mode also removes active sessions and revokes developer API tokens
`;

const main = async () => {
	loadEnv({ path: ".env.local", override: false, quiet: true });
	loadEnv({ path: ".env", override: false, quiet: true });

	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

	const { values } = parseArgs({
		args,
		options: {
			"user-id": { type: "string" },
			unban: { type: "boolean", default: false },
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

	const userId = normalizeRequiredString(values["user-id"], "--user-id");
	const isUnban = values.unban;
	const apply = values.apply;
	const mode = isUnban ? "unban" : "ban";

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = postgres(databaseUrl, { prepare: false });

	try {
		const [targetUser] = await sql`
			SELECT
				id,
				is_banned AS "isBanned",
				updated_at AS "updatedAt"
			FROM "user"
			WHERE id = ${userId}
			LIMIT 1
		`;

		if (!targetUser) {
			throw new Error("User not found");
		}

		console.log("User BAN target preview");
		console.log(`- mode: ${apply ? "apply" : "dry-run"}`);
		console.log(`- action: ${mode}`);
		console.log(`- userId: ${targetUser.id}`);
		console.log(`- currently banned: ${String(targetUser.isBanned)}`);

		if (!apply) {
			console.log("\nDry-run only. Re-run with --apply to execute.");
			return;
		}

		if (isUnban) {
			const [updated] = await sql`
				UPDATE "user"
				SET
					is_banned = false,
					updated_at = NOW()
				WHERE id = ${userId}
				RETURNING id
			`;

			if (!updated) {
				throw new Error("Failed to unban user");
			}

			console.log("\nUser unbanned");
			console.log(`- userId: ${userId}`);
			return;
		}

		const result = await sql.begin(async (tx) => {
			const [updated] = await tx`
				UPDATE "user"
				SET
					is_banned = true,
					updated_at = NOW()
				WHERE id = ${userId}
				RETURNING id
			`;

			if (!updated) {
				throw new Error("Failed to ban user");
			}

			const deletedSessionRows = await tx`
				DELETE FROM "session"
				WHERE user_id = ${userId}
				RETURNING id
			`;

			const revokedTokenRows = await tx`
				UPDATE developer_api_tokens
				SET
					revoked_at = NOW(),
					updated_at = NOW()
				WHERE user_id = ${userId}
					AND revoked_at IS NULL
				RETURNING id
			`;

			return {
				deletedSessions: deletedSessionRows.length,
				revokedTokens: revokedTokenRows.length,
			};
		});

		console.log("\nUser banned");
		console.log(`- userId: ${userId}`);
		console.log(`- deleted sessions: ${result.deletedSessions}`);
		console.log(`- revoked developer tokens: ${result.revokedTokens}`);
	} finally {
		await sql.end({ timeout: 5 });
	}
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

void main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[error] ${message}`);
	process.exit(1);
});
