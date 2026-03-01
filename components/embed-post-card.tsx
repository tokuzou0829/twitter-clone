"use client";

import { Heart, MessageCircle, Quote, Repeat2 } from "lucide-react";
import Link from "next/link";
import type {
	CSSProperties,
	MouseEvent as ReactMouseEvent,
	ReactNode,
} from "react";

import {
	type EmbedStyleOptions,
	isEmbedBorderEnabled,
	shouldShowEmbedMedia,
} from "@/lib/embed";
import type { PostSummary } from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { renderPostContent } from "./post-content-text";

const BASE_ARTICLE_PADDING_LEFT = 16;
const THREAD_INDENT = 28;
const AVATAR_CENTER_Y = 28;
const NODE_DOT_SIZE = 8;

export type EmbedThreadDecoration = {
	level: number;
	drawTop?: boolean;
	drawBottom?: boolean;
	drawParentConnector?: boolean;
	drawParentTrackTop?: boolean;
	drawParentTrackBottom?: boolean;
	emphasize?: boolean;
};

type EmbedPostCardProps = {
	post: PostSummary;
	styleOptions: EmbedStyleOptions;
	showDivider?: boolean;
	thread?: EmbedThreadDecoration;
};

export function EmbedPostCard({
	post,
	styleOptions,
	showDivider = true,
	thread,
}: EmbedPostCardProps) {
	const postPath = `/posts/${post.id}`;
	const handle = createDisplayHandle({
		handle: post.author.handle,
		name: post.author.name,
		userId: post.author.id,
	});
	const primaryLink = post.links[0] ?? null;
	const showCards = styleOptions.cards === "visible";
	const showMedia = shouldShowEmbedMedia(styleOptions);
	const imageReferrerPolicy = styleOptions.dnt
		? "no-referrer"
		: "no-referrer-when-downgrade";
	const threadLevel = thread?.level ?? 0;
	const articlePaddingLeft =
		BASE_ARTICLE_PADDING_LEFT + threadLevel * THREAD_INDENT;
	const avatarSize = styleOptions.compact ? 36 : 40;
	const contentStartX = articlePaddingLeft + avatarSize + 12;
	const threadLineX = articlePaddingLeft + 20;
	const parentThreadLineX = threadLineX - THREAD_INDENT;
	const articleStyle: CSSProperties = {
		paddingLeft: `${articlePaddingLeft}px`,
	};
	const threadLineClassName = isEmbedBorderEnabled(styleOptions)
		? "bg-[var(--embed-border)]"
		: "bg-[var(--embed-surface-muted)]";
	const nodeDotClassName = thread?.emphasize
		? "bg-[var(--embed-link)]"
		: threadLineClassName;

	const dividerClassName =
		showDivider && !thread
			? isEmbedBorderEnabled(styleOptions)
				? "border-b border-[var(--embed-border)]"
				: "border-b border-[var(--embed-surface-muted)]"
			: "";
	const threadDividerClassName =
		showDivider && thread
			? isEmbedBorderEnabled(styleOptions)
				? "border-[var(--embed-border)]"
				: "border-[var(--embed-surface-muted)]"
			: "";
	const avatarClassName = styleOptions.compact ? "h-9 w-9" : "h-10 w-10";
	const bodyTextClassName = styleOptions.compact
		? "text-sm leading-5"
		: "text-[15px] leading-6";

	const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}

		if (
			target.closest(
				"a, button, input, textarea, select, [role='button'], [data-no-post-nav='true']",
			)
		) {
			return;
		}

		openPostInNewTab(postPath);
	};

	return (
		<article
			onClickCapture={handleCardClick}
			className={`relative cursor-pointer py-3 pr-4 transition hover:bg-[var(--embed-surface-muted)] ${dividerClassName}`}
			style={articleStyle}
		>
			{thread ? (
				<div className="pointer-events-none absolute inset-0 z-0">
					{thread.drawTop ? (
						<span
							className={`absolute w-px ${threadLineClassName}`}
							style={{
								left: `${threadLineX}px`,
								top: "0px",
								height: `${AVATAR_CENTER_Y}px`,
							}}
						/>
					) : null}
					{thread.drawBottom ? (
						<span
							className={`absolute w-px ${threadLineClassName}`}
							style={{
								left: `${threadLineX}px`,
								top: `${AVATAR_CENTER_Y}px`,
								bottom: "0px",
							}}
						/>
					) : null}
					{threadLevel > 0 && thread.drawParentTrackTop ? (
						<span
							className={`absolute w-px ${threadLineClassName}`}
							style={{
								left: `${parentThreadLineX}px`,
								top: "0px",
								height: `${AVATAR_CENTER_Y}px`,
							}}
						/>
					) : null}
					{threadLevel > 0 && thread.drawParentTrackBottom ? (
						<span
							className={`absolute w-px ${threadLineClassName}`}
							style={{
								left: `${parentThreadLineX}px`,
								top: `${AVATAR_CENTER_Y}px`,
								bottom: "0px",
							}}
						/>
					) : null}
					{threadLevel > 0 && thread.drawParentConnector ? (
						<span
							className={`absolute h-px ${threadLineClassName}`}
							style={{
								left: `${parentThreadLineX}px`,
								top: `${AVATAR_CENTER_Y}px`,
								width: `${THREAD_INDENT}px`,
							}}
						/>
					) : null}
					<span
						className={`absolute rounded-full ${nodeDotClassName}`}
						style={{
							left: `${threadLineX - NODE_DOT_SIZE / 2}px`,
							top: `${AVATAR_CENTER_Y - NODE_DOT_SIZE / 2}px`,
							width: `${NODE_DOT_SIZE}px`,
							height: `${NODE_DOT_SIZE}px`,
						}}
					/>
				</div>
			) : null}

			{showDivider && thread ? (
				<span
					className={`pointer-events-none absolute right-0 bottom-0 border-b ${threadDividerClassName}`}
					style={{ left: `${contentStartX}px` }}
				/>
			) : null}

			<div className="relative z-10 flex items-start gap-3">
				<Link
					href={`/users/${post.author.id}`}
					target="_blank"
					rel="noopener noreferrer"
					data-no-post-nav="true"
					className={`mt-0.5 block shrink-0 overflow-hidden rounded-full bg-zinc-100 ${avatarClassName}`}
				>
					{post.author.image ? (
						<img
							src={post.author.image}
							alt={post.author.name}
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-500">
							{post.author.name.slice(0, 2).toUpperCase()}
						</div>
					)}
				</Link>

				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center gap-1 text-[15px] leading-5">
						<Link
							href={`/users/${post.author.id}`}
							target="_blank"
							rel="noopener noreferrer"
							data-no-post-nav="true"
							className="font-bold text-[var(--embed-text-main)] hover:underline"
						>
							{post.author.name}
						</Link>
						<span className="text-[var(--embed-text-subtle)]">{handle}</span>
						<span className="text-[var(--embed-text-subtle)]">·</span>
						<Link
							href={`/posts/${post.id}`}
							target="_blank"
							rel="noopener noreferrer"
							data-no-post-nav="true"
							className="text-[var(--embed-text-subtle)] hover:underline"
						>
							{formatRelativeTime(post.createdAt)}
						</Link>
					</div>

					{post.content ? (
						<p
							className={`mt-2 whitespace-pre-wrap break-words text-[var(--embed-text-main)] ${bodyTextClassName}`}
						>
							{renderPostContent(post.content, post.mentions, {
								openLinksInNewTab: true,
							})}
						</p>
					) : null}

					{showCards && primaryLink ? (
						<a
							href={primaryLink.url}
							target="_blank"
							rel="noopener noreferrer"
							data-no-post-nav="true"
							referrerPolicy={imageReferrerPolicy}
							className="mt-3 block overflow-hidden rounded-2xl border border-[var(--embed-border)]"
						>
							{primaryLink.imageUrl ? (
								<img
									src={primaryLink.imageUrl}
									alt={primaryLink.title ?? primaryLink.displayUrl}
									className="max-h-56 w-full object-cover"
									referrerPolicy={imageReferrerPolicy}
								/>
							) : null}
							<div className="px-3 py-2">
								<p className="truncate text-xs text-[var(--embed-text-subtle)]">
									{primaryLink.displayUrl || primaryLink.host}
								</p>
								<p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--embed-text-main)]">
									{primaryLink.title ?? primaryLink.url}
								</p>
								{primaryLink.description ? (
									<p className="mt-1 line-clamp-2 text-xs text-[var(--embed-text-subtle)]">
										{primaryLink.description}
									</p>
								) : null}
							</div>
						</a>
					) : null}

					{showMedia && post.images.length > 0 ? (
						<div className="mt-3">
							<div
								className={`grid gap-2 overflow-hidden rounded-2xl border border-[var(--embed-border)] ${
									post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"
								}`}
							>
								{post.images.slice(0, 4).map((image, index) => (
									<img
										key={image.id}
										src={image.url}
										alt={`Post media ${index + 1}`}
										referrerPolicy={imageReferrerPolicy}
										className={`w-full object-cover ${
											post.images.length === 1 ? "max-h-96" : "h-40"
										}`}
									/>
								))}
							</div>
						</div>
					) : null}

					{showCards && post.quotePost ? (
						<div className="mt-3 rounded-2xl border border-[var(--embed-border)] p-3">
							<div className="flex items-center gap-1 text-sm">
								<p className="font-bold text-[var(--embed-text-main)]">
									{post.quotePost.author.name}
								</p>
								<span className="text-[var(--embed-text-subtle)]">·</span>
								<p className="text-[var(--embed-text-subtle)]">
									{formatRelativeTime(post.quotePost.createdAt)}
								</p>
							</div>
							{post.quotePost.content ? (
								<p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--embed-text-main)]">
									{renderPostContent(
										post.quotePost.content,
										post.quotePost.mentions,
										{
											openLinksInNewTab: true,
										},
									)}
								</p>
							) : null}
							{showMedia && post.quotePost.images.length > 0 ? (
								<div
									className={`mt-2 grid gap-2 overflow-hidden rounded-xl ${
										post.quotePost.images.length === 1
											? "grid-cols-1"
											: "grid-cols-2"
									}`}
								>
									{post.quotePost.images.slice(0, 4).map((image, index) => (
										<img
											key={image.id}
											src={image.url}
											alt={`Quoted media ${index + 1}`}
											referrerPolicy={imageReferrerPolicy}
											className={`w-full object-cover ${
												post.quotePost?.images.length === 1
													? "max-h-80"
													: "h-28"
											}`}
										/>
									))}
								</div>
							) : null}
						</div>
					) : null}

					{styleOptions.showStats ? (
						<div className="mt-3 flex max-w-[440px] items-center justify-between text-[var(--embed-text-subtle)]">
							<EmbedMetric
								tone="reply"
								icon={<MessageCircle className="h-4 w-4" />}
								count={post.stats.replies}
							/>
							<EmbedMetric
								tone="quote"
								icon={<Quote className="h-4 w-4" />}
								count={post.stats.quotes}
							/>
							<EmbedMetric
								tone="repost"
								icon={<Repeat2 className="h-4 w-4" />}
								count={post.stats.reposts}
							/>
							<EmbedMetric
								tone="like"
								icon={<Heart className="h-4 w-4" />}
								count={post.stats.likes}
							/>
						</div>
					) : null}
				</div>
			</div>
		</article>
	);
}

type EmbedMetricProps = {
	tone: "reply" | "quote" | "repost" | "like";
	icon: ReactNode;
	count: number;
};

function EmbedMetric({ tone, icon, count }: EmbedMetricProps) {
	const toneClassName =
		tone === "reply"
			? "text-[var(--embed-action-reply)]"
			: tone === "quote" || tone === "repost"
				? "text-[var(--embed-action-quote)]"
				: "text-[var(--embed-action-like)]";

	return (
		<span
			className={`inline-flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-[13px] ${
				count > 0 ? toneClassName : "text-[var(--embed-text-subtle)]"
			}`}
		>
			<span aria-hidden="true">{icon}</span>
			<span className="tabular-nums">{formatMetricCount(count)}</span>
		</span>
	);
}

function openPostInNewTab(path: string) {
	if (typeof window === "undefined") {
		return;
	}

	window.open(path, "_blank", "noopener,noreferrer");
}

function formatRelativeTime(value: string) {
	const timestamp = new Date(value).getTime();
	const diffInSeconds = Math.floor((Date.now() - timestamp) / 1000);

	if (!Number.isFinite(diffInSeconds) || diffInSeconds < 0) {
		return "now";
	}

	if (diffInSeconds < 60) {
		return `${diffInSeconds}s`;
	}

	const diffInMinutes = Math.floor(diffInSeconds / 60);
	if (diffInMinutes < 60) {
		return `${diffInMinutes}m`;
	}

	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) {
		return `${diffInHours}h`;
	}

	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 7) {
		return `${diffInDays}d`;
	}

	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function formatMetricCount(value: number) {
	if (!Number.isFinite(value) || value <= 0) {
		return "0";
	}

	if (value < 1000) {
		return String(value);
	}

	if (value < 10000) {
		const compact = Math.floor((value / 1000) * 10) / 10;
		return `${compact.toFixed(1).replace(/\.0$/u, "")}K`;
	}

	if (value < 1_000_000) {
		return `${Math.floor(value / 1000)}K`;
	}

	if (value < 10_000_000) {
		const compact = Math.floor((value / 1_000_000) * 10) / 10;
		return `${compact.toFixed(1).replace(/\.0$/u, "")}M`;
	}

	return `${Math.floor(value / 1_000_000)}M`;
}
