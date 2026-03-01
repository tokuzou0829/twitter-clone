import Link from "next/link";

import { EmbedPostCard } from "@/components/embed-post-card";
import { EmbedShell } from "@/components/embed-shell";
import {
	isEmbedBorderEnabled,
	isEmbedFooterVisible,
	parseEmbedStyleOptions,
} from "@/lib/embed";
import { createDisplayHandle } from "@/lib/user-handle";

import {
	fetchEmbedProfile,
	fetchEmbedUserTimeline,
	resolveEmbedUserId,
} from "../../_embed-fetch";

type EmbedUserPageProps = {
	params: Promise<{ identifier: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmbedUserPage({
	params,
	searchParams,
}: EmbedUserPageProps) {
	const [{ identifier }, resolvedSearchParams] = await Promise.all([
		params,
		searchParams,
	]);
	const styleOptions = parseEmbedStyleOptions(resolvedSearchParams);
	const timelineContainerClassName = isEmbedBorderEnabled(styleOptions)
		? "overflow-hidden border border-[var(--embed-border)]"
		: "";
	const dividerClassName = isEmbedBorderEnabled(styleOptions)
		? "border-[var(--embed-border)]"
		: "border-[var(--embed-surface-muted)]";
	const imageReferrerPolicy = styleOptions.dnt
		? "no-referrer"
		: "no-referrer-when-downgrade";

	if (!identifier) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${timelineContainerClassName}`}
				>
					ユーザー識別子が指定されていません。
				</section>
			</EmbedShell>
		);
	}

	const resolvedUserId = await resolveEmbedUserId(identifier);
	if (!resolvedUserId) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${timelineContainerClassName}`}
				>
					指定されたユーザーが見つかりません。
				</section>
			</EmbedShell>
		);
	}

	const [profile, timelineItems] = await Promise.all([
		fetchEmbedProfile(resolvedUserId),
		fetchEmbedUserTimeline(resolvedUserId),
	]);

	if (!profile) {
		return (
			<EmbedShell styleOptions={styleOptions}>
				<section
					className={`bg-[var(--embed-surface)] px-4 py-6 text-sm text-[var(--embed-text-subtle)] ${timelineContainerClassName}`}
				>
					ユーザープロフィールの取得に失敗しました。
				</section>
			</EmbedShell>
		);
	}

	const handle = createDisplayHandle({
		handle: profile.user.handle,
		name: profile.user.name,
		userId: profile.user.id,
	});
	const uniquePosts = [
		...new Map(timelineItems.map((item) => [item.post.id, item.post])).values(),
	].slice(0, styleOptions.postLimit);
	const joinedDate = formatJoinedDate(profile.user.createdAt);
	const showProfileHeader = !styleOptions.chrome.noheader;

	return (
		<EmbedShell styleOptions={styleOptions}>
			<section
				className={`bg-[var(--embed-surface)] ${timelineContainerClassName}`}
			>
				{showProfileHeader ? (
					<>
						<div className="h-28 bg-[linear-gradient(135deg,#1d9bf0,#198ad0,#0f5f8a)]">
							{profile.user.bannerImage ? (
								<img
									src={profile.user.bannerImage}
									alt="Profile cover"
									className="h-full w-full object-cover"
									referrerPolicy={imageReferrerPolicy}
								/>
							) : null}
						</div>

						<div className="px-4 pb-4">
							<div className="-mt-10 h-20 w-20 overflow-hidden rounded-full border-4 border-[var(--embed-surface)] bg-zinc-100">
								{profile.user.image ? (
									<img
										src={profile.user.image}
										alt={profile.user.name}
										className="h-full w-full object-cover"
										referrerPolicy={imageReferrerPolicy}
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-base font-extrabold text-zinc-500">
										{profile.user.name.slice(0, 2).toUpperCase()}
									</div>
								)}
							</div>

							<div className="mt-3 space-y-2">
								<p className="truncate text-lg font-extrabold text-[var(--embed-text-main)]">
									{profile.user.name}
								</p>
								<p className="truncate text-sm text-[var(--embed-text-subtle)]">
									{handle}
								</p>
								{profile.user.bio ? (
									<p className="whitespace-pre-wrap text-[15px] leading-6 text-[var(--embed-text-main)]">
										{profile.user.bio}
									</p>
								) : null}
								<p className="text-xs text-[var(--embed-text-subtle)]">
									{joinedDate}に参加
								</p>
							</div>

							{styleOptions.showStats ? (
								<div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--embed-text-subtle)]">
									<span>
										<strong className="font-bold text-[var(--embed-text-main)]">
											{profile.stats.following.toLocaleString()}
										</strong>{" "}
										フォロー中
									</span>
									<span>
										<strong className="font-bold text-[var(--embed-text-main)]">
											{profile.stats.followers.toLocaleString()}
										</strong>{" "}
										フォロワー
									</span>
									<span>
										<strong className="font-bold text-[var(--embed-text-main)]">
											{profile.stats.posts.toLocaleString()}
										</strong>{" "}
										投稿
									</span>
								</div>
							) : null}
						</div>
					</>
				) : null}

				<div
					className={showProfileHeader ? `border-t ${dividerClassName}` : ""}
				>
					{uniquePosts.length > 0 ? (
						uniquePosts.map((post, index) => (
							<EmbedPostCard
								key={post.id}
								post={post}
								styleOptions={styleOptions}
								showDivider={index < uniquePosts.length - 1}
							/>
						))
					) : (
						<p className="px-4 py-6 text-sm text-[var(--embed-text-subtle)]">
							表示できる投稿がありません。
						</p>
					)}
				</div>
			</section>

			{isEmbedFooterVisible(styleOptions) ? (
				<section className="px-4 py-2">
					<Link
						href={`/users/${profile.user.id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center text-xs font-semibold text-[var(--embed-link)] hover:underline"
					>
						プロフィールをNumatterで表示
					</Link>
				</section>
			) : null}
		</EmbedShell>
	);
}

function formatJoinedDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "最近";
	}

	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
	});
}
