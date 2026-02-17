#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const HELP_TEXT = `Ban or unban an IP/CIDR.

Usage:
  pnpm ips:ban -- --ip "203.0.113.10" [--reason "..."] [--apply]
  pnpm ips:ban -- --ip "203.0.113.0/24" [--reason "..."] [--apply]
  pnpm ips:ban -- --ip "203.0.113.10" --unban [--apply]

Options:
  --ip <ip-or-cidr>     Target IPv4/IPv6 address or CIDR range
  --reason <text>       Optional reason
  --unban               Remove BAN entry (default is ban)
  --apply               Execute update (default is dry-run)
  --help                Show this help message

Rules:
  - Single IP input is normalized to /32 (IPv4) or /128 (IPv6)
  - Without --apply, this command does not update data
`;

const main = async () => {
	loadEnv({ path: ".env.local", override: false, quiet: true });
	loadEnv({ path: ".env", override: false, quiet: true });

	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

	const { values } = parseArgs({
		args,
		options: {
			ip: { type: "string" },
			reason: { type: "string" },
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

	const network = normalizeNetwork(values.ip);
	const reason = normalizeOptionalString(values.reason);
	const isUnban = values.unban;
	const apply = values.apply;
	const mode = isUnban ? "unban" : "ban";

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = postgres(databaseUrl, { prepare: false });

	try {
		const [existing] = await sql`
			SELECT
				id,
				network::text AS "network",
				reason,
				created_at AS "createdAt"
			FROM ip_bans
			WHERE network = ${network}::cidr
			LIMIT 1
		`;

		console.log("IP BAN target preview");
		console.log(`- mode: ${apply ? "apply" : "dry-run"}`);
		console.log(`- action: ${mode}`);
		console.log(`- network: ${network}`);
		console.log(`- currently banned: ${String(Boolean(existing))}`);
		if (reason) {
			console.log(`- reason: ${reason}`);
		}

		if (!apply) {
			console.log("\nDry-run only. Re-run with --apply to execute.");
			return;
		}

		if (isUnban) {
			const deletedRows = await sql`
				DELETE FROM ip_bans
				WHERE network = ${network}::cidr
				RETURNING id
			`;

			console.log("\nIP BAN entry removed");
			console.log(`- network: ${network}`);
			console.log(`- removed entries: ${deletedRows.length}`);
			return;
		}

		const [saved] = await sql`
			INSERT INTO ip_bans (
				id,
				network,
				reason,
				created_at,
				updated_at
			)
			VALUES (
				${randomUUID()},
				${network}::cidr,
				${reason ?? null},
				NOW(),
				NOW()
			)
			ON CONFLICT (network) DO UPDATE
			SET
				reason = COALESCE(EXCLUDED.reason, ip_bans.reason),
				updated_at = NOW()
			RETURNING
				id,
				network::text AS "network",
				reason
		`;

		if (!saved) {
			throw new Error("Failed to save IP BAN entry");
		}

		console.log("\nIP BAN entry saved");
		console.log(`- id: ${saved.id}`);
		console.log(`- network: ${saved.network}`);
		console.log(`- reason: ${saved.reason ?? "(none)"}`);
	} finally {
		await sql.end({ timeout: 5 });
	}
};

const normalizeNetwork = (value) => {
	const normalized = normalizeRequiredString(value, "--ip");

	if (!normalized.includes("/")) {
		const singleIp = normalizeIp(normalized);
		const suffix = isIP(singleIp) === 4 ? 32 : 128;
		return `${singleIp}/${suffix}`;
	}

	const [rawIp, rawPrefix, ...rest] = normalized.split("/");
	if (!rawIp || !rawPrefix || rest.length > 0) {
		throw new Error("--ip must be a valid IP or CIDR");
	}

	const ip = normalizeIp(rawIp);
	const family = isIP(ip);
	const prefix = Number.parseInt(rawPrefix, 10);
	const maxPrefix = family === 4 ? 32 : 128;
	if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
		throw new Error("--ip CIDR prefix is out of range");
	}

	return `${ip}/${prefix}`;
};

const normalizeIp = (value) => {
	const candidate = value.trim();
	if (!candidate) {
		throw new Error("--ip must be a valid IP or CIDR");
	}

	if (isIP(candidate) === 0) {
		throw new Error("--ip must be a valid IP or CIDR");
	}

	return candidate;
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

const normalizeOptionalString = (value) => {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	return normalized || null;
};

void main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[error] ${message}`);
	process.exit(1);
});
