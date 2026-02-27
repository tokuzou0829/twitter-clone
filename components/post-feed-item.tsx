"use client";

import {
	Heart,
	MessageCircle,
	MoreHorizontal,
	Quote as QuoteIcon,
	Repeat2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type SyntheticEvent,
	useEffect,
	useRef,
	useState,
} from "react";

import type { PostSummary, UserSummary } from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { LinkPreviewCard } from "./link-preview-card";
import { PostContent } from "./post-content-text";

type PostFeedItemProps = {
	post: PostSummary;
	createdAt?: string;
	repostActor?: UserSummary | null;
	isReplyComposerOpen?: boolean;
	isQuoteComposerOpen?: boolean;
	onToggleReply?: () => void;
	onToggleQuote?: () => void;
	onLike?: () => void;
	onRepost?: () => void;
	onDelete?: () => Promise<void> | void;
	canDelete?: boolean;
	canViewLikers?: boolean;
	showDivider?: boolean;
	thread?: ThreadDecoration;
};

type ThreadDecoration = {
	level: number;
	drawTop?: boolean;
	drawBottom?: boolean;
	drawParentConnector?: boolean;
	drawParentTrackTop?: boolean;
	drawParentTrackBottom?: boolean;
	emphasize?: boolean;
};

type ExpandedImage = {
	url: string;
	alt: string;
};

const BASE_ARTICLE_PADDING_LEFT = 16;
const THREAD_INDENT = 28;
const AVATAR_CENTER_Y = 32;
const NODE_DOT_SIZE = 8;
const MIN_SINGLE_IMAGE_ASPECT_RATIO = 0.75;
const MAX_SINGLE_IMAGE_ASPECT_RATIO = 1.91;
const DEFAULT_SINGLE_IMAGE_ASPECT_RATIO = 1;

export function PostFeedItem({
	post,
	createdAt,
	repostActor = null,
	isReplyComposerOpen = false,
	isQuoteComposerOpen = false,
	onToggleReply,
	onToggleQuote,
	onLike,
	onRepost,
	onDelete,
	canDelete = false,
	canViewLikers = false,
	showDivider = true,
	thread,
}: PostFeedItemProps) {
	const router = useRouter();
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(
		null,
	);
	const [singleImageAspectRatios, setSingleImageAspectRatios] = useState<
		Record<string, number>
	>({});
	const postPath = `/posts/${post.id}`;
	const displayDate = createdAt ?? post.createdAt;
	const threadLevel = thread?.level ?? 0;
	const articlePaddingLeft =
		BASE_ARTICLE_PADDING_LEFT + threadLevel * THREAD_INDENT;
	const threadLineX = articlePaddingLeft + 20;
	const parentThreadLineX = threadLineX - THREAD_INDENT;
	const articleStyle = thread
		? { paddingLeft: `${articlePaddingLeft}px` }
		: undefined;
	const threadLineClassName = "bg-zinc-300";
	const nodeDotClassName = thread?.emphasize ? "bg-sky-500" : "bg-zinc-300";
	const primaryLink = post.links[0] ?? null;

	useEffect(() => {
		if (!isMenuOpen) {
			return;
		}

		const handleClickOutside = (event: MouseEvent) => {
			if (!menuRef.current || !(event.target instanceof Node)) {
				return;
			}

			if (!menuRef.current.contains(event.target)) {
				setIsMenuOpen(false);
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsMenuOpen(false);
			}
		};

		window.addEventListener("mousedown", handleClickOutside);
		window.addEventListener("keydown", handleEscape);

		return () => {
			window.removeEventListener("mousedown", handleClickOutside);
			window.removeEventListener("keydown", handleEscape);
		};
	}, [isMenuOpen]);

	useEffect(() => {
		if (!expandedImage) {
			return;
		}

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setExpandedImage(null);
			}
		};

		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", handleEscape);

		return () => {
			document.body.style.overflow = originalOverflow;
			window.removeEventListener("keydown", handleEscape);
		};
	}, [expandedImage]);

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

		router.push(postPath);
	};

	const handleDeleteClick = async () => {
		if (!onDelete || isDeleting) {
			return;
		}

		const confirmed = window.confirm("この投稿を削除しますか？");
		if (!confirmed) {
			return;
		}

		setIsDeleting(true);
		try {
			await onDelete();
			setIsMenuOpen(false);
		} finally {
			setIsDeleting(false);
		}
	};

	const openImageOverlay = (url: string, alt: string) => {
		setExpandedImage({ url, alt });
	};

	const handleSingleImageLoad =
		(imageId: string) => (event: SyntheticEvent<HTMLImageElement>) => {
			const { naturalWidth, naturalHeight } = event.currentTarget;
			if (naturalWidth <= 0 || naturalHeight <= 0) {
				return;
			}

			const nextRatio = clampSingleImageAspectRatio(
				naturalWidth / naturalHeight,
			);
			setSingleImageAspectRatios((current) => {
				if (current[imageId] === nextRatio) {
					return current;
				}

				return {
					...current,
					[imageId]: nextRatio,
				};
			});
		};

	const getSingleImageAspectRatio = (imageId: string) => {
		return (
			singleImageAspectRatios[imageId] ?? DEFAULT_SINGLE_IMAGE_ASPECT_RATIO
		);
	};

	return (
		<article
			onClickCapture={handleCardClick}
			className={`relative cursor-pointer px-4 py-3 transition hover:bg-[var(--surface-muted)] ${
				showDivider ? "border-b border-[var(--border-subtle)]" : ""
			}`}
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
							height: `${NODE_DOT_SIZE}px`,
							width: `${NODE_DOT_SIZE}px`,
						}}
					/>
				</div>
			) : null}
			{repostActor ? (
				<p className="mb-2 flex items-center gap-2 pl-12 text-xs font-semibold text-[var(--brand-success)]">
					<Repeat2 className="h-3.5 w-3.5" />
					<span>
						{repostActor.name} (
						{createDisplayHandle({
							handle: repostActor.handle,
							name: repostActor.name,
							userId: repostActor.id,
						})}
						) がリポスト
					</span>
				</p>
			) : null}

			<div className="relative z-10 flex gap-3">
				<Link
					href={`/users/${post.author.id}`}
					className="mt-0.5 block h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-100"
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
					<div className="flex items-start justify-between gap-2">
						<div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
							<Link
								href={`/users/${post.author.id}`}
								className="font-extrabold text-[var(--text-main)] hover:underline"
							>
								{post.author.name}
							</Link>
							<span className="text-[var(--text-subtle)]">
								{createDisplayHandle({
									handle: post.author.handle,
									name: post.author.name,
									userId: post.author.id,
								})}
							</span>
							<span className="text-[var(--text-subtle)]">·</span>
							<Link
								href={postPath}
								className="text-[var(--text-subtle)] hover:underline"
							>
								{formatRelativeTime(displayDate)}
							</Link>
						</div>
						{canDelete && onDelete ? (
							<div
								ref={menuRef}
								className="relative shrink-0"
								data-no-post-nav="true"
							>
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										setIsMenuOpen((current) => !current);
									}}
									className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
									aria-label="投稿メニュー"
									aria-expanded={isMenuOpen}
								>
									<MoreHorizontal className="h-4 w-4" />
								</button>
								{isMenuOpen ? (
									<div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] py-1 shadow-[0_10px_28px_rgba(15,20,25,0.16)]">
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												void handleDeleteClick();
											}}
											disabled={isDeleting}
											className="w-full px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{isDeleting ? "削除中..." : "投稿を削除"}
										</button>
									</div>
								) : null}
							</div>
						) : null}
					</div>

					{post.replyToPostId ? (
						<p className="mt-1 text-xs text-[var(--text-subtle)]">
							投稿への返信
						</p>
					) : null}

					{post.content ? (
						<PostContent
							content={post.content}
							mentions={post.mentions}
							className="mt-2 text-[15px] leading-6 text-[var(--text-main)] break-all"
						/>
					) : null}

					{primaryLink ? <LinkPreviewCard link={primaryLink} /> : null}

					{post.images.length > 0 ? (
						<div className="mt-3" data-no-post-nav="true">
							<div
								className={`grid gap-2 overflow-hidden rounded-2xl border border-[var(--border-subtle)] ${
									post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"
								}`}
							>
								{post.images.map((image, index) => {
									const isSingleImage = post.images.length === 1;
									const aspectRatio = isSingleImage
										? getSingleImageAspectRatio(image.id)
										: undefined;

									return (
										<button
											type="button"
											key={image.id}
											onClick={(event) => {
												event.stopPropagation();
												openImageOverlay(image.url, `Post media ${index + 1}`);
											}}
											className="block overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
											style={isSingleImage ? { aspectRatio } : undefined}
											aria-label="画像を拡大表示"
										>
											<img
												src={image.url}
												alt={`Post media ${index + 1}`}
												onLoad={
													isSingleImage
														? handleSingleImageLoad(image.id)
														: undefined
												}
												className={`w-full cursor-zoom-in object-cover ${
													isSingleImage ? "h-full" : "h-44"
												}`}
											/>
										</button>
									);
								})}
							</div>
						</div>
					) : null}

					{post.quotePost ? (
						<div className="mt-3 rounded-2xl border border-[var(--border-subtle)] p-3">
							<div className="flex items-start gap-2">
								<Link
									href={`/users/${post.quotePost.author.id}`}
									className="mt-0.5 block h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-100"
								>
									{post.quotePost.author.image ? (
										<img
											src={post.quotePost.author.image}
											alt={post.quotePost.author.name}
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-500">
											{post.quotePost.author.name.slice(0, 2).toUpperCase()}
										</div>
									)}
								</Link>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1 text-sm">
										<Link
											href={`/users/${post.quotePost.author.id}`}
											className="font-bold text-[var(--text-main)] hover:underline"
										>
											{post.quotePost.author.name}
										</Link>
										<span className="text-[var(--text-subtle)]">
											{createDisplayHandle({
												handle: post.quotePost.author.handle,
												name: post.quotePost.author.name,
												userId: post.quotePost.author.id,
											})}
										</span>
										<span className="text-[var(--text-subtle)]">·</span>
										<Link
											href={`/posts/${post.quotePost.id}`}
											className="text-[var(--text-subtle)] hover:underline"
										>
											{formatRelativeTime(post.quotePost.createdAt)}
										</Link>
									</div>
									{post.quotePost.content ? (
										<PostContent
											content={post.quotePost.content}
											mentions={post.quotePost.mentions}
											className="mt-1 text-sm text-[var(--text-main)]"
										/>
									) : null}
									<Link
										href={`/posts/${post.quotePost.id}`}
										className="mt-2 inline-flex text-xs font-semibold text-[var(--brand-primary)] hover:underline"
									>
										元の投稿を表示
									</Link>
								</div>
							</div>
							{post.quotePost.images.length > 0 ? (
								<div
									className={`mt-2 grid gap-2 overflow-hidden rounded-xl ${
										post.quotePost.images.length === 1
											? "grid-cols-1"
											: "grid-cols-2"
									}`}
									data-no-post-nav="true"
								>
									{post.quotePost.images.map((image, index) => {
										const isSingleImage = post.quotePost?.images.length === 1;
										const aspectRatio = isSingleImage
											? getSingleImageAspectRatio(image.id)
											: undefined;

										return (
											<button
												type="button"
												key={image.id}
												onClick={(event) => {
													event.stopPropagation();
													openImageOverlay(
														image.url,
														`Quoted media ${index + 1}`,
													);
												}}
												className="block overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
												style={isSingleImage ? { aspectRatio } : undefined}
												aria-label="引用画像を拡大表示"
											>
												<img
													src={image.url}
													alt={`Quoted media ${index + 1}`}
													onLoad={
														isSingleImage
															? handleSingleImageLoad(image.id)
															: undefined
													}
													className={`w-full cursor-zoom-in object-cover ${
														isSingleImage ? "h-full" : "h-28"
													}`}
												/>
											</button>
										);
									})}
								</div>
							) : null}
						</div>
					) : null}

					<div className="mt-3 flex max-w-[520px] items-center justify-between">
						<ActionButton
							tone="reply"
							label="Reply"
							count={post.stats.replies}
							isActive={isReplyComposerOpen}
							onClick={onToggleReply}
							disabled={!onToggleReply}
							icon={<MessageCircle className="h-[18px] w-[18px]" />}
						/>
						<ActionButton
							tone="quote"
							label="Quote"
							count={post.stats.quotes}
							isActive={isQuoteComposerOpen}
							onClick={onToggleQuote}
							disabled={!onToggleQuote}
							icon={<QuoteIcon className="h-[18px] w-[18px]" />}
						/>
						<ActionButton
							tone="repost"
							label="Repost"
							count={post.stats.reposts}
							isActive={post.viewer.reposted}
							onClick={onRepost}
							disabled={!onRepost}
							icon={<Repeat2 className="h-[18px] w-[18px]" />}
						/>
						<ActionButton
							tone="like"
							label="Like"
							count={post.stats.likes}
							isActive={post.viewer.liked}
							onClick={onLike}
							disabled={!onLike}
							countHref={
								canViewLikers && post.stats.likes > 0
									? `/posts/${post.id}/likes`
									: undefined
							}
							icon={<Heart className="h-[18px] w-[18px]" />}
						/>
					</div>
				</div>
			</div>

			{expandedImage ? (
				<div
					className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
					role="dialog"
					aria-modal="true"
					aria-label="Expanded image"
					data-no-post-nav="true"
				>
					<button
						type="button"
						onClick={() => setExpandedImage(null)}
						className="absolute inset-0"
						aria-label="画像を閉じる"
					/>
					<button
						type="button"
						onClick={() => setExpandedImage(null)}
						className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/60"
						aria-label="画像を閉じる"
					>
						<X className="h-5 w-5" />
					</button>
					<img
						src={expandedImage.url}
						alt={expandedImage.alt}
						className="relative z-10 max-h-[88vh] w-auto max-w-[94vw] rounded-xl object-contain"
					/>
				</div>
			) : null}
		</article>
	);
}

type ActionTone = "reply" | "quote" | "repost" | "like";

type ActionButtonProps = {
	tone: ActionTone;
	label: string;
	count: number;
	icon: ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	isActive?: boolean;
	countHref?: string;
};

function ActionButton({
	tone,
	label,
	count,
	icon,
	onClick,
	disabled = false,
	isActive = false,
	countHref,
}: ActionButtonProps) {
	const toneClassName =
		tone === "reply"
			? "group-hover:text-sky-500 group-hover:bg-sky-50"
			: tone === "quote"
				? "group-hover:text-amber-600 group-hover:bg-amber-50"
				: tone === "repost"
					? "group-hover:text-emerald-600 group-hover:bg-emerald-50"
					: "group-hover:text-rose-500 group-hover:bg-rose-50";

	const activeClassName =
		tone === "reply"
			? "text-sky-500"
			: tone === "quote"
				? "text-amber-600"
				: tone === "repost"
					? "text-emerald-600"
					: "text-rose-500";

	const activeIconClassName =
		tone === "reply"
			? "bg-sky-50 text-sky-500"
			: tone === "quote"
				? "bg-amber-50 text-amber-600"
				: tone === "repost"
					? "bg-emerald-50 text-emerald-600"
					: "bg-rose-50 text-rose-500";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className={`group inline-flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--text-subtle)] transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
				isActive ? activeClassName : ""
			}`}
		>
			<span
				className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition cursor-pointer ${
					isActive ? activeIconClassName : toneClassName
				}`}
				aria-hidden="true"
			>
				{icon}
			</span>
			{typeof countHref === "string" && count > 0 ? (
				<Link
					href={countHref}
					onClick={(event) => {
						event.stopPropagation();
					}}
					data-no-post-nav="true"
					className="tabular-nums rounded-full px-2 py-0.5 text-[var(--text-subtle)] hover:bg-(--surface-muted) hover:underline cursor-pointer"
				>
					{count}
				</Link>
			) : (
				<span className="tabular-nums px-2 py-0.5">{count}</span>
			)}
		</button>
	);
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

function clampSingleImageAspectRatio(ratio: number) {
	if (!Number.isFinite(ratio) || ratio <= 0) {
		return DEFAULT_SINGLE_IMAGE_ASPECT_RATIO;
	}

	return Math.min(
		MAX_SINGLE_IMAGE_ASPECT_RATIO,
		Math.max(MIN_SINGLE_IMAGE_ASPECT_RATIO, ratio),
	);
}
