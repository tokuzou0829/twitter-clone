import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/lib/db";
import { extractPostMentions } from "@/lib/post-content";
import { createNotificationIfNeeded } from "./post-interactions";

export type ResolvedPostMention = {
	mentionedUserId: string;
	start: number;
	end: number;
	position: number;
};

export const resolvePostMentions = async (
	db: Database,
	content: string | null,
): Promise<ResolvedPostMention[]> => {
	if (!content) {
		return [];
	}

	const mentionDrafts = extractPostMentions(content);
	if (mentionDrafts.length === 0) {
		return [];
	}

	const uniqueHandles = [
		...new Set(mentionDrafts.map((mention) => mention.handle)),
	];
	const rows = await db
		.select({
			id: schema.user.id,
			handle: schema.user.handle,
		})
		.from(schema.user)
		.where(
			and(
				eq(schema.user.isBanned, false),
				inArray(schema.user.handle, uniqueHandles),
			),
		);

	const userIdByHandle = new Map<string, string>();
	for (const row of rows) {
		if (!row.handle) {
			continue;
		}

		userIdByHandle.set(row.handle, row.id);
	}

	const resolved: ResolvedPostMention[] = [];
	for (const mention of mentionDrafts) {
		const mentionedUserId = userIdByHandle.get(mention.handle);
		if (!mentionedUserId) {
			continue;
		}

		resolved.push({
			mentionedUserId,
			start: mention.start,
			end: mention.end,
			position: resolved.length,
		});
	}

	return resolved;
};

export const createPostMentionNotifications = async (params: {
	db: Database;
	publicUrl: string;
	postId: string;
	actorUserId: string;
	mentions: ResolvedPostMention[];
}) => {
	const { db, publicUrl, postId, actorUserId, mentions } = params;
	const recipientUserIds = [
		...new Set(mentions.map((mention) => mention.mentionedUserId)),
	];

	await Promise.all(
		recipientUserIds.map((recipientUserId) =>
			createNotificationIfNeeded(db, publicUrl, {
				recipientUserId,
				actorUserId,
				type: "mention",
				postId,
				sourceType: "post_mention",
				sourceId: `${postId}:${recipientUserId}`,
				actionUrl: `/posts/${postId}`,
			}),
		),
	);
};
