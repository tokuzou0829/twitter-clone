#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const HELP_TEXT = `Send system notifications.

Usage:
  pnpm notifications:send -- --user-id "user_123" --title "..." --body "..."
  pnpm notifications:send -- --user-id "user_123" --user-id "user_456" --title "..." --body "..." --apply
  pnpm notifications:send -- --all --title "..." --body "..." --campaign-key "maintenance_2026_02" --apply

Options:
  --user-id <id>         Target user id (repeatable)
  --all                  Send to all users
  --include-banned       Include banned users (only with --all)
  --limit <n>            Max recipients (only with --all)
  --type <type>          Notification type: info|violation (default: info)
  --title <text>         Notification title (max 120)
  --body <text>          Notification body (max 2000)
  --action-url <url>     Optional action URL/path (max 2048)
  --campaign-key <key>   Optional idempotency key per recipient
  --apply                Execute insert (default is dry-run)
  --help                 Show this help message

Rules:
  - Specify either --user-id or --all
  - Without --apply, this command does not write data
  - --all excludes banned users unless --include-banned is set
  - With --campaign-key, reruns skip already-created recipient rows
`;

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 2000;
const ACTION_URL_MAX_LENGTH = 2048;
const CAMPAIGN_KEY_MAX_LENGTH = 120;
const PREVIEW_LIMIT = 20;
const INSERT_CHUNK_SIZE = 500;

const main = async () => {
	loadEnv({ path: ".env.local", override: false, quiet: true });
	loadEnv({ path: ".env", override: false, quiet: true });

	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

	const { values } = parseArgs({
		args,
		options: {
			"user-id": { type: "string", multiple: true },
			all: { type: "boolean", default: false },
			"include-banned": { type: "boolean", default: false },
			limit: { type: "string" },
			type: { type: "string", default: "info" },
			title: { type: "string" },
			body: { type: "string" },
			"action-url": { type: "string" },
			"campaign-key": { type: "string" },
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

	const targetUserIds = normalizeUserIds(values["user-id"]);
	const sendToAll = values.all;
	const includeBanned = values["include-banned"];
	const recipientLimit = parseOptionalPositiveInt(values.limit, "--limit");
	const type = normalizeNotificationType(values.type);
	const title = normalizeBoundedRequiredString(
		values.title,
		"--title",
		TITLE_MAX_LENGTH,
	);
	const body = normalizeBoundedRequiredString(
		values.body,
		"--body",
		BODY_MAX_LENGTH,
	);
	const actionUrl = normalizeBoundedOptionalString(
		values["action-url"],
		"--action-url",
		ACTION_URL_MAX_LENGTH,
	);
	const campaignKey = normalizeBoundedOptionalString(
		values["campaign-key"],
		"--campaign-key",
		CAMPAIGN_KEY_MAX_LENGTH,
	);
	const apply = values.apply;

	if (sendToAll && targetUserIds.length > 0) {
		throw new Error("Specify either --user-id or --all, not both");
	}

	if (!sendToAll && targetUserIds.length === 0) {
		throw new Error("Specify either --user-id or --all");
	}

	if (!sendToAll && includeBanned) {
		throw new Error("--include-banned is only supported with --all");
	}

	if (!sendToAll && recipientLimit !== null) {
		throw new Error("--limit is only supported with --all");
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = postgres(databaseUrl, { prepare: false });

	try {
		const recipients = sendToAll
			? await loadAllRecipients(sql, {
					includeBanned,
					limit: recipientLimit,
				})
			: await loadSpecificRecipients(sql, targetUserIds);

		printPreview({
			sendToAll,
			includeBanned,
			recipientLimit,
			type,
			title,
			body,
			actionUrl,
			campaignKey,
			apply,
			recipients,
		});

		if (!apply) {
			console.log("\nDry-run only. Re-run with --apply to execute.");
			return;
		}

		if (recipients.length === 0) {
			console.log("\nNo recipients matched. Nothing to send.");
			return;
		}

		const sourceType = resolveSourceType({
			sendToAll,
			hasCampaignKey: Boolean(campaignKey),
		});
		const createdAt = new Date();
		const rows = recipients.map((recipient) => ({
			id: randomUUID(),
			recipient_user_id: recipient.id,
			actor_user_id: null,
			type,
			source_type: sourceType,
			source_id: buildSourceId({
				campaignKey,
				recipientUserId: recipient.id,
			}),
			title,
			body,
			action_url: actionUrl,
			created_at: createdAt,
		}));

		const insertResult = await insertNotifications(sql, rows);

		console.log("\nNotifications sent");
		console.log(`- recipients: ${recipients.length}`);
		console.log(`- inserted: ${insertResult.insertedCount}`);
		console.log(`- skipped (duplicate): ${insertResult.skippedCount}`);
	} finally {
		await sql.end({ timeout: 5 });
	}
};

const loadAllRecipients = async (sql, options) => {
	const limitClause =
		typeof options.limit === "number" ? sql`LIMIT ${options.limit}` : sql``;

	if (options.includeBanned) {
		return await sql`
			SELECT
				id,
				is_banned AS "isBanned"
			FROM "user"
			ORDER BY created_at ASC
			${limitClause}
		`;
	}

	return await sql`
		SELECT
			id,
			is_banned AS "isBanned"
		FROM "user"
		WHERE is_banned = false
		ORDER BY created_at ASC
		${limitClause}
	`;
};

const loadSpecificRecipients = async (sql, userIds) => {
	const rows = await sql`
		SELECT
			id,
			is_banned AS "isBanned"
		FROM "user"
		WHERE id IN ${sql(userIds)}
	`;

	const byId = new Map(rows.map((row) => [row.id, row]));
	const missing = userIds.filter((userId) => !byId.has(userId));
	if (missing.length > 0) {
		throw new Error(`User not found: ${missing.join(", ")}`);
	}

	return userIds.map((userId) => {
		const row = byId.get(userId);
		if (!row) {
			throw new Error("Unexpected user mapping error");
		}
		return row;
	});
};

const insertNotifications = async (sql, rows) => {
	let insertedCount = 0;

	for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
		const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);
		const insertedRows = await sql`
			INSERT INTO notifications ${sql(
				chunk,
				"id",
				"recipient_user_id",
				"actor_user_id",
				"type",
				"source_type",
				"source_id",
				"title",
				"body",
				"action_url",
				"created_at",
			)}
			ON CONFLICT (source_type, source_id) DO NOTHING
			RETURNING id
		`;

		insertedCount += insertedRows.length;
	}

	return {
		insertedCount,
		skippedCount: rows.length - insertedCount,
	};
};

const printPreview = (params) => {
	console.log("Notification target preview");
	console.log(`- mode: ${params.apply ? "apply" : "dry-run"}`);
	console.log(`- recipients mode: ${params.sendToAll ? "all" : "user-id"}`);
	if (params.sendToAll) {
		console.log(`- include banned: ${String(params.includeBanned)}`);
	}
	if (params.recipientLimit !== null) {
		console.log(`- limit: ${params.recipientLimit}`);
	}
	console.log(`- notification type: ${params.type}`);
	console.log(`- title: ${JSON.stringify(params.title)}`);
	console.log(`- body: ${JSON.stringify(params.body)}`);
	if (params.actionUrl) {
		console.log(`- actionUrl: ${params.actionUrl}`);
	}
	if (params.campaignKey) {
		console.log(`- campaignKey: ${params.campaignKey}`);
	}
	console.log(`- matched recipients: ${params.recipients.length}`);

	if (params.recipients.length === 0) {
		return;
	}

	console.log("- recipient preview:");
	for (const recipient of params.recipients.slice(0, PREVIEW_LIMIT)) {
		console.log(`  - ${recipient.id}${recipient.isBanned ? " (banned)" : ""}`);
	}

	if (params.recipients.length > PREVIEW_LIMIT) {
		console.log(`  - ...and ${params.recipients.length - PREVIEW_LIMIT} more`);
	}
};

const resolveSourceType = (params) => {
	if (params.hasCampaignKey) {
		return "system_cli_campaign";
	}

	return params.sendToAll ? "system_broadcast_cli" : "system_cli";
};

const buildSourceId = (params) => {
	if (params.campaignKey) {
		return `${params.campaignKey}:${params.recipientUserId}`;
	}

	return randomUUID();
};

const normalizeNotificationType = (value) => {
	if (value === "info" || value === "violation") {
		return value;
	}

	throw new Error("--type must be one of: info, violation");
};

const normalizeUserIds = (value) => {
	if (value === undefined) {
		return [];
	}

	if (!Array.isArray(value)) {
		return [];
	}

	const normalized = [];
	const seen = new Set();

	for (const rawUserId of value) {
		if (typeof rawUserId !== "string") {
			continue;
		}

		const userId = rawUserId.trim();
		if (!userId || seen.has(userId)) {
			continue;
		}

		seen.add(userId);
		normalized.push(userId);
	}

	return normalized;
};

const normalizeBoundedRequiredString = (value, optionName, maxLength) => {
	if (typeof value !== "string") {
		throw new Error(`${optionName} is required`);
	}

	const normalized = value.trim();
	if (!normalized) {
		throw new Error(`${optionName} is required`);
	}

	if (normalized.length > maxLength) {
		throw new Error(`${optionName} must be ${maxLength} characters or fewer`);
	}

	return normalized;
};

const normalizeBoundedOptionalString = (value, optionName, maxLength) => {
	if (typeof value !== "string") {
		return null;
	}

	const normalized = value.trim();
	if (!normalized) {
		return null;
	}

	if (normalized.length > maxLength) {
		throw new Error(`${optionName} must be ${maxLength} characters or fewer`);
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

void main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[error] ${message}`);
	process.exit(1);
});
