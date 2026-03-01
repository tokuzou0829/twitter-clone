import Link from "next/link";

import {
	EmbedPostCard,
	type EmbedThreadDecoration,
} from "@/components/embed-post-card";
import { EmbedShell } from "@/components/embed-shell";
import {
	isEmbedBorderEnabled,
	isEmbedFooterVisible,
	parseEmbedStyleOptions,
} from "@/lib/embed";
import type { PostSummary } from "@/lib/social-api";

import { fetchEmbedPostDetail } from "../../_embed-fetch";

type EmbedPostPageProps = {
	params: Promise<{ postId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type EmbedConversationRow = {
	post: PostSummary;
	kind: "ancestor" | "target" | "reply";
};

export default async function EmbedPostPage({
	params,
	searchParams,
}: EmbedPostPageProps) {
	const [{ postId }, resolvedSearchParams] = await Promise.all([
		params,
		searchParams,
	]);
	const styleOptions = parseEmbedStyleOptions(resolvedSearchParams);
	const timelineClassName = isEmbedBorderEnabled(styleOptions)
		? "overflow-hidden border border-[var(--embed-border)]"
		: "";
	const messageClassName = isEmbedBorderEnabled(styleOptions)
		? "border border-[var(--embed-border)]"
		: "";

	if (!postId) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${messageClassName}`}
				>
					投稿IDが指定されていません。
				</section>
			</EmbedShell>
		);
	}

	const detail = await fetchEmbedPostDetail(postId);
	if (!detail) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${messageClassName}`}
				>
					指定された投稿は存在しないか、読み込みに失敗しました。
				</section>
			</EmbedShell>
		);
	}

	const conversationRows = selectConversationRows(
		detail.post,
		detail.conversationPath,
		detail.replies,
		styleOptions.conversation,
		styleOptions.postLimit,
	);

	return (
		<EmbedShell styleOptions={styleOptions}>
			<section className={`bg-[var(--embed-surface)] ${timelineClassName}`}>
				{conversationRows.map((row, index) => (
					<EmbedPostCard
						key={row.post.id}
						post={row.post}
						styleOptions={styleOptions}
						showDivider={index < conversationRows.length - 1}
						thread={createConversationThreadDecoration(conversationRows, index)}
					/>
				))}
			</section>
			{isEmbedFooterVisible(styleOptions) ? (
				<section className="px-4 py-2">
					<Link
						href={`/posts/${detail.post.id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex text-xs font-semibold text-[var(--embed-link)] hover:underline"
					>
						Numatterで投稿を見る
					</Link>
				</section>
			) : null}
		</EmbedShell>
	);
}

function selectConversationRows(
	targetPost: PostSummary,
	conversationPath: PostSummary[],
	replies: PostSummary[],
	conversation: "all" | "none",
	limit: number,
): EmbedConversationRow[] {
	const maxItems = Math.max(1, limit);

	if (conversation === "none") {
		return [
			{
				post: targetPost,
				kind: "target",
			},
		];
	}

	const reservedReplySlots = replies.length > 0 && maxItems >= 2 ? 1 : 0;
	const maxAncestors = Math.max(0, maxItems - 1 - reservedReplySlots);
	const visibleAncestors = conversationPath.slice(-maxAncestors);

	const rows: EmbedConversationRow[] = visibleAncestors.map((post) => ({
		post,
		kind: "ancestor",
	}));
	rows.push({
		post: targetPost,
		kind: "target",
	});

	const remainingSlots = maxItems - rows.length;
	if (remainingSlots > 0) {
		rows.push(
			...replies.slice(0, remainingSlots).map((post) => ({
				post,
				kind: "reply" as const,
			})),
		);
	}

	return rows;
}

function createConversationThreadDecoration(
	rows: EmbedConversationRow[],
	index: number,
): EmbedThreadDecoration | undefined {
	if (rows.length <= 1) {
		return undefined;
	}

	const row = rows[index];
	if (!row) {
		return undefined;
	}

	const targetIndex = rows.findIndex((item) => item.kind === "target");

	if (row.kind === "reply") {
		const nextRow = rows[index + 1];
		return {
			level: 1,
			drawParentConnector: true,
			drawParentTrackTop: true,
			drawParentTrackBottom: nextRow?.kind === "reply",
		};
	}

	const hasReplies = rows.some((item) => item.kind === "reply");

	return {
		level: 0,
		drawTop: index > 0,
		drawBottom: index < targetIndex || (row.kind === "target" && hasReplies),
		emphasize: row.kind === "target",
	};
}
