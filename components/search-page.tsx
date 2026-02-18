"use client";

import { Search, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import {
	createQuote,
	createReply,
	type DiscoverData,
	deletePost,
	fetchDiscoverData,
	type LinkSummary,
	type PostSummary,
	refreshLinkPreview,
	type SearchResponse,
	searchPostsAndHashtags,
	toggleLike,
	toggleRepost,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { Modal } from "./modal";
import { PostComposer } from "./post-composer";
import { PostFeedItem } from "./post-feed-item";

const EMPTY_DISCOVER_DATA: DiscoverData = {
	trends: [],
	suggestedUsers: [],
};

const EMPTY_SEARCH_RESULTS: SearchResponse = {
	query: "",
	posts: [],
	users: [],
	hashtags: [],
};

type PostInteractionSummary = {
	postId: string;
	liked: boolean;
	reposted: boolean;
	likes: number;
	reposts: number;
};

type SearchPageProps = {
	initialQuery: string;
};

export function SearchPage({ initialQuery }: SearchPageProps) {
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const sessionUserId = session?.user?.id ?? null;
	const [inputValue, setInputValue] = useState(initialQuery);
	const [activeQuery, setActiveQuery] = useState(initialQuery);
	const [searchResults, setSearchResults] =
		useState<SearchResponse>(EMPTY_SEARCH_RESULTS);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [activeReplyPostId, setActiveReplyPostId] = useState<string | null>(
		null,
	);
	const [activeQuotePostId, setActiveQuotePostId] = useState<string | null>(
		null,
	);
	const [discoverData, setDiscoverData] =
		useState<DiscoverData>(EMPTY_DISCOVER_DATA);
	const [isDiscoverLoading, setIsDiscoverLoading] = useState(true);
	const [discoverError, setDiscoverError] = useState<string | null>(null);

	useEffect(() => {
		setInputValue(initialQuery);
		setActiveQuery(initialQuery);
	}, [initialQuery]);

	const replyTargetPost = useMemo(() => {
		if (!activeReplyPostId) {
			return null;
		}

		return (
			searchResults.posts.find((post) => post.id === activeReplyPostId) ?? null
		);
	}, [activeReplyPostId, searchResults.posts]);

	const quoteTargetPost = useMemo(() => {
		if (!activeQuotePostId) {
			return null;
		}

		return (
			searchResults.posts.find((post) => post.id === activeQuotePostId) ?? null
		);
	}, [activeQuotePostId, searchResults.posts]);

	useEffect(() => {
		let ignore = false;

		const loadDiscover = async () => {
			setIsDiscoverLoading(true);
			setDiscoverError(null);
			try {
				const data = await fetchDiscoverData(sessionUserId);
				if (ignore) {
					return;
				}
				setDiscoverData(data);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setDiscoverError(loadError.message);
				} else {
					setDiscoverError("Failed to load trends");
				}
			} finally {
				if (!ignore) {
					setIsDiscoverLoading(false);
				}
			}
		};

		void loadDiscover();

		return () => {
			ignore = true;
		};
	}, [sessionUserId]);

	useEffect(() => {
		let ignore = false;
		const normalizedQuery = activeQuery.trim();

		if (!normalizedQuery) {
			setSearchResults(EMPTY_SEARCH_RESULTS);
			setSearchError(null);
			setIsSearching(false);
			setActiveReplyPostId(null);
			setActiveQuotePostId(null);
			return;
		}

		const runSearch = async () => {
			setIsSearching(true);
			setSearchError(null);
			try {
				const result = await searchPostsAndHashtags(normalizedQuery);
				if (ignore) {
					return;
				}
				const hydratedResult =
					await hydrateSearchResultsWithLinkPreview(result);
				if (ignore) {
					return;
				}
				setSearchResults(hydratedResult);
			} catch (searchLoadError) {
				if (ignore) {
					return;
				}
				if (searchLoadError instanceof Error) {
					setSearchError(searchLoadError.message);
				} else {
					setSearchError("Failed to search");
				}
			} finally {
				if (!ignore) {
					setIsSearching(false);
				}
			}
		};

		void runSearch();

		return () => {
			ignore = true;
		};
	}, [activeQuery]);

	useEffect(() => {
		if (sessionUserId) {
			return;
		}

		setActiveReplyPostId(null);
	}, [sessionUserId]);

	useEffect(() => {
		if (
			activeReplyPostId &&
			!searchResults.posts.some((post) => post.id === activeReplyPostId)
		) {
			setActiveReplyPostId(null);
		}

		if (
			activeQuotePostId &&
			!searchResults.posts.some((post) => post.id === activeQuotePostId)
		) {
			setActiveQuotePostId(null);
		}
	}, [activeQuotePostId, activeReplyPostId, searchResults.posts]);

	const updatePostInteraction = (params: PostInteractionSummary) => {
		setSearchResults((current) => ({
			...current,
			posts: current.posts.map((post) => {
				if (post.id !== params.postId) {
					return post;
				}

				return {
					...post,
					stats: {
						...post.stats,
						likes: params.likes,
						reposts: params.reposts,
					},
					viewer: {
						...post.viewer,
						liked: params.liked,
						reposted: params.reposted,
					},
				};
			}),
		}));
	};

	const refreshSearchResults = async () => {
		const normalizedQuery = activeQuery.trim();
		if (!normalizedQuery) {
			return;
		}

		setIsSearching(true);
		setSearchError(null);
		try {
			const nextResults = await searchPostsAndHashtags(normalizedQuery);
			setSearchResults(await hydrateSearchResultsWithLinkPreview(nextResults));
		} catch (refreshError) {
			if (refreshError instanceof Error) {
				setActionError(refreshError.message);
			} else {
				setActionError("Failed to refresh search results");
			}
		} finally {
			setIsSearching(false);
		}
	};

	const handleLike = async (postId: string, isLiked: boolean) => {
		if (!sessionUserId) {
			setActionError("Please log in to like posts");
			return;
		}

		setActionError(null);
		try {
			const summary = await toggleLike(postId, isLiked);
			updatePostInteraction(summary);
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setActionError(toggleError.message);
			}
		}
	};

	const handleRepost = async (postId: string, isReposted: boolean) => {
		if (!sessionUserId) {
			setActionError("Please log in to repost");
			return;
		}

		setActionError(null);
		try {
			const summary = await toggleRepost(postId, isReposted);
			updatePostInteraction(summary);
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
		await refreshSearchResults();
	};

	const submitQuote = async (targetPostId: string, formData: FormData) => {
		if (!sessionUserId) {
			throw new Error("Please log in to quote repost");
		}

		await createQuote(targetPostId, formData);
		setActiveQuotePostId(null);
		setActionError(null);
		await refreshSearchResults();
	};

	const handleDelete = async (postId: string) => {
		if (!sessionUserId) {
			setActionError("Please log in to delete posts");
			return;
		}

		setActionError(null);
		try {
			await deletePost(postId);
			setActiveReplyPostId((current) => (current === postId ? null : current));
			setActiveQuotePostId((current) => (current === postId ? null : current));
			await refreshSearchResults();
		} catch (deleteError) {
			if (deleteError instanceof Error) {
				setActionError(deleteError.message);
			}
		}
	};

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

	const commitSearch = (rawQuery: string) => {
		const normalized = rawQuery.trim();
		setInputValue(normalized);
		setActiveQuery(normalized);
		router.push(
			normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search",
		);
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		commitSearch(inputValue);
	};

	const normalizedQuery = activeQuery.trim();

	return (
		<AppShell pageTitle="検索">
			<section className="border-b border-[var(--border-subtle)] bg-[var(--surface-main)] px-4 py-3">
				<form onSubmit={handleSubmit} className="relative">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
					<input
						type="search"
						value={inputValue}
						onChange={(event) => setInputValue(event.target.value)}
						placeholder="投稿・ハッシュタグを検索"
						className="h-11 w-full rounded-full border border-transparent bg-[var(--surface-muted)] pl-10 pr-4 text-base outline-none transition focus:border-sky-400 focus:bg-white"
					/>
				</form>
			</section>

			{actionError ? (
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{actionError}
				</section>
			) : null}

			{searchError ? (
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{searchError}
				</section>
			) : null}

			{normalizedQuery ? (
				<section className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text-subtle)]">
					<span className="font-semibold text-[var(--text-main)]">
						「{normalizedQuery}」
					</span>{" "}
					の検索結果
				</section>
			) : null}

			{isSearching ? (
				<section className="border-b border-[var(--border-subtle)] px-4 py-6 text-sm text-[var(--text-subtle)]">
					検索中...
				</section>
			) : null}

			{!normalizedQuery ? (
				<section>
					<div className="border-b border-[var(--border-subtle)] px-4 py-4">
						<p className="text-lg font-extrabold text-[var(--text-main)]">
							トレンドを見つける
						</p>
						<p className="mt-1 text-sm text-[var(--text-subtle)]">
							気になるキーワードを入力して投稿を探そう。
						</p>
					</div>

					{discoverError ? (
						<p className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{discoverError}
						</p>
					) : isDiscoverLoading ? (
						<p className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text-subtle)]">
							トレンドを読み込んでいます...
						</p>
					) : discoverData.trends.length === 0 ? (
						<p className="border-b border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text-subtle)]">
							現在トレンドになっているハッシュタグはありません。
						</p>
					) : (
						<ul>
							{discoverData.trends.map((trend) => (
								<li key={trend.tag}>
									<button
										type="button"
										onClick={() => {
											setInputValue(trend.tag);
											commitSearch(trend.tag);
										}}
										className="flex w-full items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 text-left transition hover:bg-[var(--surface-muted)]"
									>
										<div>
											<p className="text-xs text-[var(--text-subtle)]">
												トレンド
											</p>
											<p className="text-base font-bold text-[var(--text-main)]">
												{trend.tag}
											</p>
											<p className="text-xs text-[var(--text-subtle)]">
												{trend.count} 件の投稿
											</p>
										</div>
										<Sparkles className="h-4 w-4 text-sky-500" />
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			) : (
				<section>
					<div className="border-b border-[var(--border-subtle)] px-4 py-3">
						<p className="text-sm text-[var(--text-subtle)]">
							{searchResults.users.length} 件のユーザー /{" "}
							{searchResults.posts.length} 件の投稿 /{" "}
							{searchResults.hashtags.length} 件のハッシュタグ
						</p>
					</div>

					{searchResults.users.length > 0 ? (
						<section className="border-b border-(--border-subtle) px-4 py-4">
							<p className="text-sm font-bold text-foreground">ユーザー</p>
							<ul className="mt-3 space-y-1">
								{searchResults.users.map((user) => (
									<li key={user.id}>
										<Link
											href={`/users/${user.id}`}
											className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--surface-muted)]"
										>
											{user.image ? (
												<Image
													src={user.image}
													alt=""
													width={40}
													height={40}
													className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-muted)] object-cover"
												/>
											) : (
												<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-lg font-bold text-[var(--text-subtle)]">
													{(user.name ?? "?").charAt(0).toUpperCase()}
												</div>
											)}
											<div className="min-w-0 flex-1">
												<p className="truncate font-bold text-[var(--text-main)]">
													{user.name}
												</p>
												<p className="truncate text-sm text-[var(--text-subtle)]">
													{createDisplayHandle({
														handle: user.handle,
														name: user.name,
														userId: user.id,
													})}
												</p>
												{user.bio ? (
													<p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-subtle)]">
														{user.bio}
													</p>
												) : null}
											</div>
										</Link>
									</li>
								))}
							</ul>
						</section>
					) : null}

					{searchResults.hashtags.length > 0 ? (
						<section className="border-b border-[var(--border-subtle)] px-4 py-4">
							<p className="text-sm font-bold text-[var(--text-main)]">
								ハッシュタグ
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								{searchResults.hashtags.map((hashtag) => (
									<Link
										key={hashtag.tag}
										href={`/search?q=${encodeURIComponent(hashtag.tag)}`}
										className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
									>
										<span>{hashtag.tag}</span>
										<span className="text-xs text-sky-600">
											{hashtag.count}
										</span>
									</Link>
								))}
							</div>
						</section>
					) : null}

					{searchResults.posts.length === 0 ? (
						<div className="border-b border-[var(--border-subtle)] px-4 py-10 text-center">
							<p className="text-lg font-extrabold text-[var(--text-main)]">
								投稿が見つかりませんでした
							</p>
							<p className="mt-1 text-sm text-[var(--text-subtle)]">
								別のキーワードで検索してみてください。
							</p>
						</div>
					) : (
						<div>
							{searchResults.posts.map((post) => (
								<PostFeedItem
									key={post.id}
									post={post}
									isReplyComposerOpen={activeReplyPostId === post.id}
									isQuoteComposerOpen={activeQuotePostId === post.id}
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
										void handleLike(post.id, post.viewer.liked);
									}}
									onRepost={() => {
										void handleRepost(post.id, post.viewer.reposted);
									}}
									canDelete={sessionUserId === post.author.id}
									onDelete={() => handleDelete(post.id)}
								/>
							))}
						</div>
					)}
				</section>
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
							placeholder="Add your opinion"
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

const hydrateSearchResultsWithLinkPreview = async (results: SearchResponse) => {
	const updatedLink = await refreshLinkPreview(
		collectSearchResultLinkIds(results.posts),
	).catch(() => null);

	if (!updatedLink) {
		return results;
	}

	return {
		...results,
		posts: results.posts.map((post) =>
			applyLinkSummaryToPost(post, updatedLink),
		),
	};
};

const collectSearchResultLinkIds = (posts: PostSummary[]) => {
	return [
		...new Set(
			posts.flatMap((post) => [
				...post.links.map((link) => link.id),
				...(post.quotePost?.links.map((link) => link.id) ?? []),
			]),
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
