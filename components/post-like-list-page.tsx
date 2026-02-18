"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
	type FollowListResponse,
	fetchPostDetail,
	fetchPostLikers,
	type PostDetailResponse,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";

type PostLikeListPageProps = {
	postId: string;
};

export function PostLikeListPage({ postId }: PostLikeListPageProps) {
	const [detail, setDetail] = useState<PostDetailResponse | null>(null);
	const [list, setList] = useState<FollowListResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const title = useMemo(() => {
		if (!detail) {
			return "いいねしたユーザー";
		}

		const authorHandle = createDisplayHandle({
			handle: detail.post.author.handle,
			name: detail.post.author.name,
			userId: detail.post.author.id,
		});

		return `${authorHandle}の投稿をいいねしたユーザー`;
	}, [detail]);

	useEffect(() => {
		let ignore = false;
		setIsLoading(true);
		setError(null);

		const load = async () => {
			try {
				const [nextDetail, nextList] = await Promise.all([
					fetchPostDetail(postId),
					fetchPostLikers(postId),
				]);
				if (ignore) {
					return;
				}
				setDetail(nextDetail);
				setList(nextList);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setError(loadError.message);
				} else {
					setError("Failed to load likers");
				}
			} finally {
				if (!ignore) {
					setIsLoading(false);
				}
			}
		};

		void load();
		return () => {
			ignore = true;
		};
	}, [postId]);

	return (
		<AppShell pageTitle={title}>
			<section className="border-b border-[var(--border-subtle)] px-4 py-4">
				<Link
					href={`/posts/${postId}`}
					className="text-sm font-semibold text-sky-600 hover:underline"
				>
					投稿へ戻る
				</Link>
			</section>

			{error ? (
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
					{error}
				</section>
			) : isLoading ? (
				<section className="border-b border-[var(--border-subtle)] px-4 py-6 text-sm text-[var(--text-subtle)]">
					いいねしたユーザーを読み込んでいます...
				</section>
			) : (list?.users ?? []).length === 0 ? (
				<section className="border-b border-[var(--border-subtle)] px-4 py-6 text-sm text-[var(--text-subtle)]">
					まだこの投稿にいいねしたユーザーはいません。
				</section>
			) : (
				<ul>
					{(list?.users ?? []).map((account) => {
						const handle = createDisplayHandle({
							handle: account.handle,
							name: account.name,
							userId: account.id,
						});

						return (
							<li
								key={account.id}
								className="border-b border-[var(--border-subtle)]"
							>
								<Link
									href={`/users/${account.id}`}
									className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--surface-muted)]"
								>
									<div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-bold text-zinc-500">
										{account.image ? (
											<img
												src={account.image}
												alt={account.name}
												className="h-full w-full object-cover"
											/>
										) : (
											account.name.slice(0, 2).toUpperCase()
										)}
									</div>
									<div className="min-w-0">
										<p className="truncate text-sm font-bold text-[var(--text-main)]">
											{account.name}
										</p>
										<p className="truncate text-xs text-[var(--text-subtle)]">
											{handle}
										</p>
										{account.bio ? (
											<p className="mt-1 line-clamp-2 text-xs text-[var(--text-subtle)]">
												{account.bio}
											</p>
										) : null}
									</div>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</AppShell>
	);
}
