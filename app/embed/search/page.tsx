import Link from "next/link";

import { EmbedPostCard } from "@/components/embed-post-card";
import { EmbedShell } from "@/components/embed-shell";
import {
	isEmbedBorderEnabled,
	isEmbedFooterVisible,
	parseEmbedStyleOptions,
} from "@/lib/embed";
import { createDisplayHandle } from "@/lib/user-handle";

import { fetchEmbedSearchResult } from "../_embed-fetch";

type EmbedSearchPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmbedSearchPage({
	searchParams,
}: EmbedSearchPageProps) {
	const resolvedSearchParams = await searchParams;
	const styleOptions = parseEmbedStyleOptions(resolvedSearchParams);
	const rawQuery = resolvedSearchParams.q;
	const query = (
		Array.isArray(rawQuery) ? rawQuery[0] : (rawQuery ?? "")
	).trim();
	const timelineContainerClassName = isEmbedBorderEnabled(styleOptions)
		? "overflow-hidden border border-[var(--embed-border)]"
		: "";
	const rowDividerClassName = isEmbedBorderEnabled(styleOptions)
		? "border-b border-[var(--embed-border)]"
		: "border-b border-[var(--embed-surface-muted)]";
	const showCards = styleOptions.cards === "visible";
	const showSearchHeader = !styleOptions.chrome.noheader;
	const imageReferrerPolicy = styleOptions.dnt
		? "no-referrer"
		: "no-referrer-when-downgrade";

	if (!query) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${timelineContainerClassName}`}
				>
					q クエリに検索キーワードを指定すると結果を表示できます。
				</section>
			</EmbedShell>
		);
	}

	const searchResult = await fetchEmbedSearchResult(query);
	if (!searchResult) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${timelineContainerClassName}`}
				>
					検索結果の取得に失敗しました。
				</section>
			</EmbedShell>
		);
	}

	const limitedPosts = searchResult.posts.slice(0, styleOptions.postLimit);
	const limitedUsers = searchResult.users.slice(0, styleOptions.postLimit);
	const limitedHashtags = searchResult.hashtags.slice(
		0,
		styleOptions.postLimit,
	);

	return (
		<EmbedShell styleOptions={styleOptions}>
			<section
				className={`bg-[var(--embed-surface)] ${timelineContainerClassName}`}
			>
				{showSearchHeader ? (
					<div
						className={`px-4 py-2 text-xs text-[var(--embed-text-subtle)] ${rowDividerClassName}`}
					>
						「{searchResult.query}」の検索結果
					</div>
				) : null}

				{styleOptions.showStats ? (
					<div
						className={`px-4 py-2 text-xs text-[var(--embed-text-subtle)] ${rowDividerClassName}`}
					>
						{searchResult.posts.length} posts / {searchResult.users.length}{" "}
						users / {searchResult.hashtags.length} hashtags
					</div>
				) : null}

				{showCards && limitedUsers.length > 0 ? (
					<div className={`px-4 py-3 ${rowDividerClassName}`}>
						<p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--embed-text-subtle)]">
							Users
						</p>
						<ul className="mt-2">
							{limitedUsers.map((user, index) => (
								<li
									key={user.id}
									className={
										index < limitedUsers.length - 1 ? rowDividerClassName : ""
									}
								>
									<Link
										href={`/users/${user.id}`}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-3 py-2 transition hover:bg-[var(--embed-surface-muted)]"
									>
										<div className="h-10 w-10 overflow-hidden rounded-full bg-zinc-100">
											{user.image ? (
												<img
													src={user.image}
													alt={user.name}
													className="h-full w-full object-cover"
													referrerPolicy={imageReferrerPolicy}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-500">
													{user.name.slice(0, 2).toUpperCase()}
												</div>
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold text-[var(--embed-text-main)]">
												{user.name}
											</p>
											<p className="truncate text-xs text-[var(--embed-text-subtle)]">
												{createDisplayHandle({
													handle: user.handle,
													name: user.name,
													userId: user.id,
												})}
											</p>
										</div>
									</Link>
								</li>
							))}
						</ul>
					</div>
				) : null}

				{showCards && limitedHashtags.length > 0 ? (
					<div
						className={`px-4 py-3 ${
							limitedPosts.length > 0 ? rowDividerClassName : ""
						}`}
					>
						<p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--embed-text-subtle)]">
							Hashtags
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{limitedHashtags.map((hashtag) => (
								<Link
									key={hashtag.tag}
									href={`/search?q=${encodeURIComponent(hashtag.tag)}`}
									target="_blank"
									rel="noopener noreferrer"
									className="rounded-full border border-[var(--embed-border)] bg-[var(--embed-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--embed-text-main)]"
								>
									{hashtag.tag}
									{styleOptions.showStats ? ` (${hashtag.count})` : ""}
								</Link>
							))}
						</div>
					</div>
				) : null}

				{limitedPosts.length > 0 ? (
					<div>
						{limitedPosts.map((post, index) => (
							<EmbedPostCard
								key={post.id}
								post={post}
								styleOptions={styleOptions}
								showDivider={index < limitedPosts.length - 1}
							/>
						))}
					</div>
				) : (
					<p className="px-4 py-6 text-sm text-[var(--embed-text-subtle)]">
						このキーワードに一致する投稿は見つかりませんでした。
					</p>
				)}
			</section>

			{isEmbedFooterVisible(styleOptions) ? (
				<section className="px-4 py-2">
					<Link
						href={`/search?q=${encodeURIComponent(searchResult.query)}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center text-xs font-semibold text-[var(--embed-link)] hover:underline"
					>
						Numatterで検索結果を見る
					</Link>
				</section>
			) : null}
		</EmbedShell>
	);
}
