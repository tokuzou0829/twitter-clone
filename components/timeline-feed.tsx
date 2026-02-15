"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
	createQuote,
	createReply,
	deletePost,
	fetchTimeline,
	type LinkSummary,
	type ProfileTimelineTab,
	refreshLinkPreview,
	type TimelineItem,
	toggleLike,
	toggleRepost,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { Modal } from "./modal";
import { PostComposer } from "./post-composer";
import { PostFeedItem } from "./post-feed-item";

type TimelineFeedProps = {
	userId?: string;
	sessionUserId: string | null;
	profileTab?: ProfileTimelineTab;
};

export function TimelineFeed({
	userId,
	sessionUserId,
	profileTab = "posts",
}: TimelineFeedProps) {
	const [items, setItems] = useState<TimelineItem[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [activeReplyPostId, setActiveReplyPostId] = useState<string | null>(
		null,
	);
	const [activeQuotePostId, setActiveQuotePostId] = useState<string | null>(
		null,
	);

	const loadTimeline = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const nextItems = await fetchTimeline(userId, profileTab);
			const refreshedLink = await refreshLinkPreview(
				collectTimelineLinkIds(nextItems),
			).catch(() => null);
			setItems(
				refreshedLink
					? applyLinkSummaryToTimelineItems(nextItems, refreshedLink)
					: nextItems,
			);
		} catch (loadError) {
			if (loadError instanceof Error) {
				setError(loadError.message);
			} else {
				setError("Failed to load timeline");
			}
		} finally {
			setIsLoading(false);
		}
	}, [profileTab, userId]);

	useEffect(() => {
		setActiveReplyPostId(null);
		setActiveQuotePostId(null);
		void loadTimeline();
	}, [loadTimeline]);

	useEffect(() => {
		if (sessionUserId) {
			return;
		}

		setActiveReplyPostId(null);
		setActiveQuotePostId(null);
	}, [sessionUserId]);

	const sortedItems = useMemo(() => {
		return [...items].sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
	}, [items]);

	const replyTargetPost = useMemo(() => {
		if (!activeReplyPostId) {
			return null;
		}

		const targetItem = sortedItems.find(
			(item) => item.post.id === activeReplyPostId,
		);

		return targetItem?.post ?? null;
	}, [activeReplyPostId, sortedItems]);

	const quoteTargetPost = useMemo(() => {
		if (!activeQuotePostId) {
			return null;
		}

		const targetItem = sortedItems.find(
			(item) => item.post.id === activeQuotePostId,
		);

		return targetItem?.post ?? null;
	}, [activeQuotePostId, sortedItems]);

	const updatePostInteraction = (params: {
		postId: string;
		liked: boolean;
		reposted: boolean;
		likes: number;
		reposts: number;
	}) => {
		setItems((current) =>
			current.map((item) => {
				if (item.post.id !== params.postId) {
					return item;
				}

				return {
					...item,
					post: {
						...item.post,
						stats: {
							...item.post.stats,
							likes: params.likes,
							reposts: params.reposts,
						},
						viewer: {
							...item.post.viewer,
							liked: params.liked,
							reposted: params.reposted,
						},
					},
				};
			}),
		);
	};

	const handleLike = async (postId: string, isLiked: boolean) => {
		if (!sessionUserId) {
			setError("Please log in to like posts");
			return;
		}

		try {
			const summary = await toggleLike(postId, isLiked);
			updatePostInteraction(summary);
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setError(toggleError.message);
			}
		}
	};

	const handleRepost = async (postId: string, isReposted: boolean) => {
		if (!sessionUserId) {
			setError("Please log in to repost");
			return;
		}

		try {
			const summary = await toggleRepost(postId, isReposted);
			updatePostInteraction(summary);
			await loadTimeline();
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setError(toggleError.message);
			}
		}
	};

	const handleReply = async (postId: string, formData: FormData) => {
		if (!sessionUserId) {
			throw new Error("Please log in to reply");
		}

		await createReply(postId, formData);
		setActiveReplyPostId(null);
		await loadTimeline();
	};

	const handleQuote = async (postId: string, formData: FormData) => {
		if (!sessionUserId) {
			throw new Error("Please log in to quote repost");
		}

		await createQuote(postId, formData);
		setActiveQuotePostId(null);
		await loadTimeline();
	};

	const handleDelete = async (postId: string) => {
		if (!sessionUserId) {
			setError("Please log in to delete posts");
			return;
		}

		try {
			await deletePost(postId);
			setActiveReplyPostId((current) => (current === postId ? null : current));
			setActiveQuotePostId((current) => (current === postId ? null : current));
			await loadTimeline();
		} catch (deleteError) {
			if (deleteError instanceof Error) {
				setError(deleteError.message);
			}
		}
	};

	if (isLoading) {
		return (
			<section className="space-y-0">
				{["alpha", "beta", "gamma"].map((skeletonId) => (
					<div
						key={skeletonId}
						className="animate-pulse border-b border-[var(--border-subtle)] px-4 py-4"
					>
						<div className="flex gap-3">
							<div className="h-10 w-10 rounded-full bg-zinc-200" />
							<div className="min-w-0 flex-1 space-y-2">
								<div className="h-3 w-40 rounded-full bg-zinc-200" />
								<div className="h-3 w-full rounded-full bg-zinc-100" />
								<div className="h-3 w-2/3 rounded-full bg-zinc-100" />
							</div>
						</div>
					</div>
				))}
			</section>
		);
	}

	return (
		<section>
			{error ? (
				<p className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</p>
			) : null}

			{sortedItems.length === 0 ? (
				<div className="border-b border-[var(--border-subtle)] px-4 py-10 text-center">
					<p className="text-xl font-extrabold text-[var(--text-main)]">
						何もないみたい...
					</p>
					<p className="mt-2 text-sm text-[var(--text-subtle)]">
						キミが新世界の物語を始めよう!!
					</p>
				</div>
			) : null}

			{sortedItems.map((item) => (
				<PostFeedItem
					key={item.id}
					post={item.post}
					createdAt={item.createdAt}
					repostActor={item.type === "repost" ? item.actor : null}
					isReplyComposerOpen={activeReplyPostId === item.post.id}
					isQuoteComposerOpen={activeQuotePostId === item.post.id}
					onToggleReply={() => {
						if (!sessionUserId) {
							setError("Please log in to reply");
							return;
						}

						setError(null);
						setActiveReplyPostId((current) =>
							current === item.post.id ? null : item.post.id,
						);
						setActiveQuotePostId(null);
					}}
					onToggleQuote={() => {
						setActiveQuotePostId((current) =>
							current === item.post.id ? null : item.post.id,
						);
						setActiveReplyPostId(null);
					}}
					onLike={() => {
						void handleLike(item.post.id, item.post.viewer.liked);
					}}
					onRepost={() => {
						void handleRepost(item.post.id, item.post.viewer.reposted);
					}}
					canDelete={sessionUserId === item.post.author.id}
					onDelete={() => handleDelete(item.post.id)}
				/>
			))}

			{activeReplyPostId ? (
				<Modal
					title="Reply"
					onClose={() => setActiveReplyPostId(null)}
					panelClassName="max-w-xl"
				>
					<div className="space-y-3 px-4 py-4">
						{replyTargetPost ? (
							<ComposerTargetCard label="Replying to" post={replyTargetPost} />
						) : null}
						<PostComposer
							title=""
							placeholder="Post your reply"
							submitLabel="Reply"
							variant="inline"
							onSubmit={(formData) => {
								if (!activeReplyPostId) {
									throw new Error("Reply target not found");
								}
								return handleReply(activeReplyPostId, formData);
							}}
							onCancel={() => setActiveReplyPostId(null)}
						/>
					</div>
				</Modal>
			) : null}

			{activeQuotePostId ? (
				<Modal
					title="Quote"
					onClose={() => setActiveQuotePostId(null)}
					panelClassName="max-w-xl"
				>
					<div className="space-y-3 px-4 py-4">
						{quoteTargetPost ? (
							<ComposerTargetCard label="Quoting" post={quoteTargetPost} />
						) : null}
						<PostComposer
							title=""
							placeholder="Add your opinion"
							submitLabel="Quote"
							variant="inline"
							onSubmit={(formData) => {
								if (!activeQuotePostId) {
									throw new Error("Quote target not found");
								}
								return handleQuote(activeQuotePostId, formData);
							}}
							onCancel={() => setActiveQuotePostId(null)}
						/>
					</div>
				</Modal>
			) : null}
		</section>
	);
}

type ComposerTargetCardProps = {
	label: string;
	post: TimelineItem["post"];
};

function ComposerTargetCard({ label, post }: ComposerTargetCardProps) {
	const handle = createDisplayHandle({
		handle: post.author.handle,
		name: post.author.name,
		userId: post.author.id,
	});

	return (
		<div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
			<p className="text-xs font-bold uppercase tracking-wide text-[var(--text-subtle)]">
				{label}
			</p>
			<p className="mt-1 text-sm font-bold text-[var(--text-main)]">
				{post.author.name}
				<span className="ml-1 font-medium text-[var(--text-subtle)]">
					{handle}
				</span>
			</p>
			{post.content ? (
				<p className="mt-1 max-h-28 overflow-hidden whitespace-pre-wrap text-sm text-[var(--text-main)]">
					{post.content}
				</p>
			) : (
				<p className="mt-1 text-sm text-[var(--text-subtle)]">
					Media-only post
				</p>
			)}
		</div>
	);
}

const collectTimelineLinkIds = (items: TimelineItem[]) => {
	return [...new Set(items.flatMap((item) => collectPostLinkIds(item.post)))];
};

const collectPostLinkIds = (post: TimelineItem["post"]) => {
	const quoteLinks = post.quotePost?.links.map((link) => link.id) ?? [];
	return [...post.links.map((link) => link.id), ...quoteLinks];
};

const applyLinkSummaryToTimelineItems = (
	items: TimelineItem[],
	updatedLink: LinkSummary,
) => {
	return items.map((item) => ({
		...item,
		post: applyLinkSummaryToPost(item.post, updatedLink),
	}));
};

const applyLinkSummaryToPost = (
	post: TimelineItem["post"],
	updatedLink: LinkSummary,
) => {
	const nextLinks = post.links.map((link) =>
		link.id === updatedLink.id ? updatedLink : link,
	);

	if (!post.quotePost) {
		return {
			...post,
			links: nextLinks,
		};
	}

	return {
		...post,
		links: nextLinks,
		quotePost: {
			...post.quotePost,
			links: post.quotePost.links.map((link) =>
				link.id === updatedLink.id ? updatedLink : link,
			),
		},
	};
};
