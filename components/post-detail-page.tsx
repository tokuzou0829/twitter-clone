"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import {
	createQuote,
	createReply,
	deletePost,
	fetchPostDetail,
	type LinkSummary,
	type PostDetailResponse,
	type PostSummary,
	refreshLinkPreview,
	toggleLike,
	toggleRepost,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { Modal } from "./modal";
import { PostComposer } from "./post-composer";
import { PostFeedItem } from "./post-feed-item";

type PostDetailPageProps = {
	postId: string;
};

export function PostDetailPage({ postId }: PostDetailPageProps) {
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const sessionUserId = session?.user?.id ?? null;
	const [detail, setDetail] = useState<PostDetailResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const [activeReplyPostId, setActiveReplyPostId] = useState<string | null>(
		null,
	);
	const [activeQuotePostId, setActiveQuotePostId] = useState<string | null>(
		null,
	);

	useEffect(() => {
		let ignore = false;
		const requestKey = reloadKey;

		const loadDetail = async () => {
			setIsLoading(true);
			setLoadError(null);
			try {
				const nextDetail = await fetchPostDetail(postId);
				const hydratedDetail = await hydrateDetailWithLinkPreview(nextDetail);
				if (ignore || requestKey !== reloadKey) {
					return;
				}
				setDetail(hydratedDetail);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setLoadError(loadError.message);
				} else {
					setLoadError("Failed to load post");
				}
			} finally {
				if (!ignore) {
					setIsLoading(false);
				}
			}
		};

		void loadDetail();

		return () => {
			ignore = true;
		};
	}, [postId, reloadKey]);

	const visiblePosts = useMemo(() => {
		if (!detail) {
			return [];
		}

		return [...detail.conversationPath, detail.post, ...detail.replies];
	}, [detail]);

	const chainPosts = useMemo(() => {
		if (!detail) {
			return [];
		}

		return [...detail.conversationPath, detail.post];
	}, [detail]);

	const replyTargetPost = useMemo(() => {
		if (!activeReplyPostId) {
			return null;
		}

		return visiblePosts.find((post) => post.id === activeReplyPostId) ?? null;
	}, [activeReplyPostId, visiblePosts]);

	const quoteTargetPost = useMemo(() => {
		if (!activeQuotePostId) {
			return null;
		}

		return visiblePosts.find((post) => post.id === activeQuotePostId) ?? null;
	}, [activeQuotePostId, visiblePosts]);

	useEffect(() => {
		if (sessionUserId) {
			return;
		}

		setActiveReplyPostId(null);
	}, [sessionUserId]);

	const toggleReplyComposer = (targetPostId: string) => {
		if (!sessionUserId) {
			setActionError("Please log in to reply");
			return;
		}

		setActionError(null);
		setActiveReplyPostId((current) =>
			current === targetPostId ? null : targetPostId,
		);
		setActiveQuotePostId(null);
	};

	const handleLike = async (post: PostSummary) => {
		if (!sessionUserId) {
			setActionError("Please log in to like posts");
			return;
		}

		setActionError(null);
		try {
			await toggleLike(post.id, post.viewer.liked);
			setReloadKey((current) => current + 1);
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setActionError(toggleError.message);
			}
		}
	};

	const handleRepost = async (post: PostSummary) => {
		if (!sessionUserId) {
			setActionError("Please log in to repost");
			return;
		}

		setActionError(null);
		try {
			await toggleRepost(post.id, post.viewer.reposted);
			setReloadKey((current) => current + 1);
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setActionError(toggleError.message);
			}
		}
	};

	const submitReply = async (targetPostId: string, formData: FormData) => {
		if (!sessionUserId) {
			throw new Error("Please log in to reply");
		}

		await createReply(targetPostId, formData);
		setActiveReplyPostId(null);
		setActionError(null);
		setReloadKey((current) => current + 1);
	};

	const submitQuote = async (targetPostId: string, formData: FormData) => {
		if (!sessionUserId) {
			throw new Error("Please log in to quote repost");
		}

		await createQuote(targetPostId, formData);
		setActiveQuotePostId(null);
		setActionError(null);
		setReloadKey((current) => current + 1);
	};

	const handleDeletePost = async (post: PostSummary) => {
		if (!sessionUserId) {
			setActionError("Please log in to delete posts");
			return;
		}

		setActionError(null);
		try {
			await deletePost(post.id);
			setActiveReplyPostId((current) => (current === post.id ? null : current));
			setActiveQuotePostId((current) => (current === post.id ? null : current));

			if (post.id === detail?.post.id) {
				router.push("/");
				return;
			}

			setReloadKey((current) => current + 1);
		} catch (deleteError) {
			if (deleteError instanceof Error) {
				setActionError(deleteError.message);
			}
		}
	};

	if (isLoading) {
		return (
			<AppShell pageTitle="投稿">
				<section className="border-b border-[var(--border-subtle)] px-4 py-6 text-sm text-[var(--text-subtle)]">
					投稿を読み込んでいます...
				</section>
			</AppShell>
		);
	}

	if (loadError || !detail) {
		return (
			<AppShell pageTitle="投稿">
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
					{loadError ?? "投稿が見つかりませんでした"}
				</section>
			</AppShell>
		);
	}

	return (
		<AppShell pageTitle="投稿">
			<section className="border-b border-[var(--border-subtle)] px-4 py-3">
				<button
					type="button"
					onClick={() => {
						if (window.history.length > 1) {
							router.back();
							return;
						}

						router.push("/");
					}}
					className="inline-flex cursor-pointer bg-transparent p-0 text-sm font-semibold text-[var(--brand-primary)] hover:underline"
				>
					戻る
				</button>
			</section>

			{actionError ? (
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{actionError}
				</section>
			) : null}

			{chainPosts.map((post, index) => {
				const isCurrentPost = index === chainPosts.length - 1;
				const hasReplies = isCurrentPost && detail.replies.length > 0;

				return (
					<PostFeedItem
						key={`chain-${post.id}`}
						post={post}
						isReplyComposerOpen={activeReplyPostId === post.id}
						isQuoteComposerOpen={activeQuotePostId === post.id}
						canViewLikers={sessionUserId === post.author.id}
						onToggleReply={() => {
							toggleReplyComposer(post.id);
						}}
						onToggleQuote={() => {
							setActiveQuotePostId((current) =>
								current === post.id ? null : post.id,
							);
							setActiveReplyPostId(null);
						}}
						onLike={() => {
							void handleLike(post);
						}}
						onRepost={() => {
							void handleRepost(post);
						}}
						canDelete={sessionUserId === post.author.id}
						onDelete={() => handleDeletePost(post)}
						showDivider={false}
						thread={{
							level: 0,
							drawTop: index > 0,
							drawBottom: !isCurrentPost || hasReplies,
							emphasize: isCurrentPost,
						}}
					/>
				);
			})}

			{detail.replies.length === 0 ? (
				<section className="px-4 py-10 text-center">
					<p className="text-lg font-extrabold text-[var(--text-main)]">
						まだ返信はありません
					</p>
					<p className="mt-2 text-sm text-[var(--text-subtle)]">
						最初の返信を投稿して会話を始めましょう。
					</p>
				</section>
			) : (
				detail.replies.map((reply, index) => {
					const isLastReply = index === detail.replies.length - 1;

					return (
						<PostFeedItem
							key={`reply-${reply.id}`}
							post={reply}
							isReplyComposerOpen={activeReplyPostId === reply.id}
							isQuoteComposerOpen={activeQuotePostId === reply.id}
							canViewLikers={sessionUserId === reply.author.id}
							onToggleReply={() => {
								toggleReplyComposer(reply.id);
							}}
							onToggleQuote={() => {
								setActiveQuotePostId((current) =>
									current === reply.id ? null : reply.id,
								);
								setActiveReplyPostId(null);
							}}
							onLike={() => {
								void handleLike(reply);
							}}
							onRepost={() => {
								void handleRepost(reply);
							}}
							canDelete={sessionUserId === reply.author.id}
							onDelete={() => handleDeletePost(reply)}
							showDivider={false}
							thread={{
								level: 1,
								drawTop: false,
								drawBottom: false,
								drawParentConnector: true,
								drawParentTrackTop: true,
								drawParentTrackBottom: !isLastReply,
							}}
						/>
					);
				})
			)}

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
								return submitReply(activeReplyPostId, formData);
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
							placeholder="あなたの意見を追加"
							submitLabel="Quote"
							variant="inline"
							onSubmit={(formData) => {
								if (!activeQuotePostId) {
									throw new Error("Quote target not found");
								}
								return submitQuote(activeQuotePostId, formData);
							}}
							onCancel={() => setActiveQuotePostId(null)}
						/>
					</div>
				</Modal>
			) : null}
		</AppShell>
	);
}

type ComposerTargetCardProps = {
	label: string;
	post: PostSummary;
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

const hydrateDetailWithLinkPreview = async (detail: PostDetailResponse) => {
	const updatedLink = await refreshLinkPreview(
		collectDetailLinkIds(detail),
	).catch(() => null);

	if (!updatedLink) {
		return detail;
	}

	return {
		...detail,
		post: applyLinkSummaryToPost(detail.post, updatedLink),
		conversationPath: detail.conversationPath.map((post) =>
			applyLinkSummaryToPost(post, updatedLink),
		),
		replies: detail.replies.map((post) =>
			applyLinkSummaryToPost(post, updatedLink),
		),
	};
};

const collectDetailLinkIds = (detail: PostDetailResponse) => {
	return [
		...new Set(
			[...detail.conversationPath, detail.post, ...detail.replies].flatMap(
				(post) => [
					...post.links.map((link) => link.id),
					...(post.quotePost?.links.map((link) => link.id) ?? []),
				],
			),
		),
	];
};

const applyLinkSummaryToPost = (
	post: PostSummary,
	updatedLink: LinkSummary,
) => {
	if (!post.quotePost) {
		return {
			...post,
			links: post.links.map((link) =>
				link.id === updatedLink.id ? updatedLink : link,
			),
		};
	}

	return {
		...post,
		links: post.links.map((link) =>
			link.id === updatedLink.id ? updatedLink : link,
		),
		quotePost: {
			...post.quotePost,
			links: post.quotePost.links.map((link) =>
				link.id === updatedLink.id ? updatedLink : link,
			),
		},
	};
};
