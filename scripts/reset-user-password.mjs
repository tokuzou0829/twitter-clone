#!/usr/bin/env node

import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const HELP_TEXT = `Reset a user's password.

Usage:
  pnpm users:password-reset -- --user-id "<id>" --new-password "<password>" [--apply]
  NEW_PASSWORD="<password>" pnpm users:password-reset -- --user-id "<id>" --new-password-env NEW_PASSWORD [--apply]

Options:
  --user-id <id>                 Target user id
  --new-password <password>      New password
  --new-password-env <env-name>  Read new password from environment variable
  --apply                        Execute update (default is dry-run)
  --help                         Show this help message

Rules:
  - Specify exactly one of --new-password or --new-password-env
  - Password length must be 8-128 characters
  - Without --apply, this command does not update data
  - Applying reset also deletes active sessions for the user
`;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const main = async () => {
	loadEnv({ path: ".env.local", override: false, quiet: true });
	loadEnv({ path: ".env", override: false, quiet: true });

	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

	const { values } = parseArgs({
		args,
		options: {
			"user-id": { type: "string" },
			"new-password": { type: "string" },
			"new-password-env": { type: "string" },
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
	const passwordInput = resolvePasswordInput({
		rawPassword: values["new-password"],
		rawEnvName: values["new-password-env"],
	});
	validatePassword(passwordInput.password);
	const apply = values.apply;

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = postgres(databaseUrl, { prepare: false });

	try {
		const [targetUser] = await sql`
			SELECT
				id,
				email
			FROM "user"
			WHERE id = ${userId}
			LIMIT 1
		`;

		if (!targetUser) {
			throw new Error("User not found");
		}

		const credentialAccounts = await sql`
			SELECT
				id,
				password
			FROM account
			WHERE user_id = ${userId}
				AND provider_id = 'credential'
		`;

		if (credentialAccounts.length === 0) {
			throw new Error("Credential account not found for user");
		}

		const hasPassword = credentialAccounts.some(
			(credentialAccount) => typeof credentialAccount.password === "string",
		);

		console.log("User password reset target preview");
		console.log(`- mode: ${apply ? "apply" : "dry-run"}`);
		console.log(`- userId: ${targetUser.id}`);
		console.log(`- email: ${targetUser.email}`);
		console.log(`- credential accounts: ${credentialAccounts.length}`);
		console.log(`- currently has password: ${String(hasPassword)}`);
		console.log(`- password source: ${passwordInput.source}`);
		if (passwordInput.source === "env") {
			console.log(`- password env: ${passwordInput.envName}`);
		}

		if (!apply) {
			console.log("\nDry-run only. Re-run with --apply to execute.");
			return;
		}

		const nextPasswordHash = await hashPassword(passwordInput.password);

		const result = await sql.begin(async (tx) => {
			const updatedCredentialRows = await tx`
				UPDATE account
				SET
					password = ${nextPasswordHash},
					updated_at = NOW()
				WHERE user_id = ${userId}
					AND provider_id = 'credential'
				RETURNING id
			`;

			if (updatedCredentialRows.length === 0) {
				throw new Error("Failed to update credential account password");
			}

			const deletedSessionRows = await tx`
				DELETE FROM "session"
				WHERE user_id = ${userId}
				RETURNING id
			`;

			return {
				updatedCredentialAccounts: updatedCredentialRows.length,
				deletedSessions: deletedSessionRows.length,
			};
		});

		console.log("\nUser password reset completed");
		console.log(`- userId: ${userId}`);
		console.log(
			`- updated credential accounts: ${result.updatedCredentialAccounts}`,
		);
		console.log(`- deleted sessions: ${result.deletedSessions}`);
	} finally {
		await sql.end({ timeout: 5 });
	}
};

const resolvePasswordInput = ({ rawPassword, rawEnvName }) => {
	const hasRawPassword = typeof rawPassword === "string";
	const hasEnvName = typeof rawEnvName === "string";

	if (hasRawPassword === hasEnvName) {
		throw new Error(
			"Specify exactly one of --new-password or --new-password-env",
		);
	}

	if (hasRawPassword) {
		return {
			source: "arg",
			password: rawPassword,
		};
	}

	const envName = normalizeRequiredString(rawEnvName, "--new-password-env");
	if (!ENV_NAME_PATTERN.test(envName)) {
		throw new Error(
			"--new-password-env must be a valid environment variable name",
		);
	}

	const envValue = process.env[envName];
	if (typeof envValue !== "string") {
		throw new Error(`${envName} is not set`);
	}

	return {
		source: "env",
		envName,
		password: envValue,
	};
};

const validatePassword = (password) => {
	if (password.length < PASSWORD_MIN_LENGTH) {
		throw new Error(
			`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
		);
	}

	if (password.length > PASSWORD_MAX_LENGTH) {
		throw new Error(
			`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`,
		);
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
