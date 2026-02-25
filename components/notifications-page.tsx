"use client";

import {
	AtSign,
	CircleAlert,
	Heart,
	Info,
	MessageCircle,
	Quote as QuoteIcon,
	Repeat2,
	UserPlus,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import {
	fetchNotifications,
	type NotificationFilter,
	type NotificationItem,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";

const NOTIFICATION_FILTERS: Array<{ id: NotificationFilter; label: string }> = [
	{ id: "all", label: "すべて" },
	{ id: "follow", label: "フォロー" },
	{ id: "like", label: "いいね" },
	{ id: "repost", label: "リポスト" },
	{ id: "reply", label: "リプライ" },
	{ id: "quote", label: "引用" },
	{ id: "mention", label: "メンション" },
	{ id: "info", label: "INFO" },
];

export function NotificationsPage() {
	const { data: session, isPending } = authClient.useSession();
	const sessionUserId = session?.user?.id ?? null;
	const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
	const [items, setItems] = useState<NotificationItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!sessionUserId) {
			setItems([]);
			setError(null);
			setIsLoading(false);
			return;
		}

		let ignore = false;

		const loadNotifications = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const response = await fetchNotifications(activeFilter);
				if (ignore) {
					return;
				}
				setItems(response.items);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setError(loadError.message);
				} else {
					setError("Failed to fetch notifications");
				}
			} finally {
				if (!ignore) {
					setIsLoading(false);
				}
			}
		};

		void loadNotifications();

		return () => {
			ignore = true;
		};
	}, [activeFilter, sessionUserId]);

	const emptyMessage = useMemo(() => {
		if (activeFilter === "all") {
			return "新しい通知はまだありません。";
		}

		const target = NOTIFICATION_FILTERS.find(
			(filter) => filter.id === activeFilter,
		);
		return `${target?.label ?? "この種類"}の通知はまだありません。`;
	}, [activeFilter]);

	if (isPending) {
		return (
			<AppShell pageTitle="通知">
				<section className="border-b border-[var(--border-subtle)] px-4 py-6 text-sm text-[var(--text-subtle)]">
					通知を読み込んでいます...
				</section>
			</AppShell>
		);
	}

	if (!session?.user) {
		return (
			<AppShell pageTitle="通知">
				<section className="border-b border-[var(--border-subtle)] px-4 py-8">
					<p className="text-lg font-extrabold text-[var(--text-main)]">
						通知を見るにはログインが必要です
					</p>
					<p className="mt-2 text-sm text-[var(--text-subtle)]">
						フォロー、いいね、リポスト、引用や運営からのお知らせを確認できます。
					</p>
					<div className="mt-4 flex gap-2">
						<Link
							href="/login"
							className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm font-bold text-white"
						>
							ログイン
						</Link>
						<Link
							href="/signup"
							className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-main)]"
						>
							今すぐ参加
						</Link>
					</div>
				</section>
			</AppShell>
		);
	}

	return (
		<AppShell pageTitle="通知">
			<section className="border-b border-[var(--border-subtle)]">
				<div className="flex overflow-x-auto px-2 py-1">
					{NOTIFICATION_FILTERS.map((filter) => {
						const isActive = activeFilter === filter.id;
						return (
							<button
								key={filter.id}
								type="button"
								onClick={() => setActiveFilter(filter.id)}
								className={`rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
									isActive
										? "bg-[var(--text-main)] text-white"
										: "text-[var(--text-subtle)] hover:bg-[var(--surface-muted)]"
								}`}
							>
								{filter.label}
							</button>
						);
					})}
				</div>
			</section>

			{error ? (
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</section>
			) : null}

			{isLoading ? (
				<section>
					{["notify-skeleton-a", "notify-skeleton-b", "notify-skeleton-c"].map(
						(id) => (
							<div
								key={id}
								className="animate-pulse border-b border-[var(--border-subtle)] px-4 py-4"
							>
								<div className="flex gap-3">
									<div className="h-10 w-10 rounded-full bg-zinc-200" />
									<div className="min-w-0 flex-1 space-y-2">
										<div className="h-3 w-56 rounded-full bg-zinc-200" />
										<div className="h-3 w-4/5 rounded-full bg-zinc-100" />
									</div>
								</div>
							</div>
						),
					)}
				</section>
			) : items.length === 0 ? (
				<section className="border-b border-[var(--border-subtle)] px-4 py-10 text-center">
					<p className="text-xl font-extrabold text-[var(--text-main)]">
						通知はありません
					</p>
					<p className="mt-2 text-sm text-[var(--text-subtle)]">
						{emptyMessage}
					</p>
				</section>
			) : (
				<ul>
					{items.map((item) => (
						<li
							key={item.id}
							className="border-b border-[var(--border-subtle)]"
						>
							<NotificationCard item={item} />
						</li>
					))}
				</ul>
			)}
		</AppShell>
	);
}

type NotificationCardProps = {
	item: NotificationItem;
};

function NotificationCard({ item }: NotificationCardProps) {
	const icon = getNotificationIcon(item.type);
	const summary = createNotificationSummary(item);
	const content = (
		<div className="flex gap-3">
			<div className={`mt-1 shrink-0 ${icon.textClassName}`}>{icon.node}</div>
			<div className="min-w-0 flex-1">
				{item.actors.length > 0 ? (
					<div className="relative h-9" aria-hidden="true">
						{item.actors.slice(0, 3).map((actor, index) => (
							<div
								key={actor.id}
								className="absolute top-0 h-9 w-9 overflow-hidden rounded-full border-2 border-white bg-zinc-100"
								style={{ left: `${index * 18}px`, zIndex: 10 - index }}
							>
								{actor.image ? (
									<img
										src={actor.image}
										alt={actor.name}
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-500">
										{actor.name.slice(0, 2).toUpperCase()}
									</div>
								)}
							</div>
						))}
					</div>
				) : null}

				<p className="mt-1 text-[15px] leading-6 text-[var(--text-main)]">
					{summary}
				</p>
				<p className="mt-1 text-xs text-[var(--text-subtle)]">
					{formatRelativeTime(item.createdAt)}
				</p>

				{item.body ? (
					<p
						className={`mt-2 whitespace-pre-wrap text-sm ${
							item.type === "violation"
								? "text-rose-700"
								: "text-[var(--text-main)]"
						}`}
					>
						{item.body}
					</p>
				) : null}

				{item.post ? (
					<div className="mt-2 rounded-2xl border border-[var(--border-subtle)] px-3 py-2">
						<p className="text-xs text-[var(--text-subtle)]">
							{createDisplayHandle({
								handle: item.post.author.handle,
								name: item.post.author.name,
								userId: item.post.author.id,
							})}
						</p>
						<p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--text-main)]">
							{item.post.content ?? "メディアのみの投稿"}
						</p>
					</div>
				) : null}

				{item.type === "quote" && item.quotePost ? (
					<div className="mt-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
						<p className="text-xs font-semibold text-[var(--text-subtle)]">
							引用投稿
						</p>
						<p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--text-main)]">
							{item.quotePost.content ?? "メディアのみの投稿"}
						</p>
					</div>
				) : null}
			</div>
		</div>
	);

	if (item.actionUrl) {
		return (
			<Link
				href={item.actionUrl}
				className="block px-4 py-3 transition hover:bg-[var(--surface-muted)]"
			>
				{content}
			</Link>
		);
	}

	return <div className="px-4 py-3">{content}</div>;
}

function getNotificationIcon(type: NotificationItem["type"]) {
	if (type === "follow") {
		return {
			node: <UserPlus className="h-7 w-7" />,
			textClassName: "text-sky-500",
		};
	}

	if (type === "like") {
		return {
			node: <Heart className="h-7 w-7" />,
			textClassName: "text-rose-500",
		};
	}

	if (type === "repost") {
		return {
			node: <Repeat2 className="h-7 w-7" />,
			textClassName: "text-emerald-600",
		};
	}

	if (type === "reply") {
		return {
			node: <MessageCircle className="h-7 w-7" />,
			textClassName: "text-sky-600",
		};
	}

	if (type === "quote") {
		return {
			node: <QuoteIcon className="h-7 w-7" />,
			textClassName: "text-amber-600",
		};
	}

	if (type === "mention") {
		return {
			node: <AtSign className="h-7 w-7" />,
			textClassName: "text-violet-600",
		};
	}

	if (type === "violation") {
		return {
			node: <CircleAlert className="h-7 w-7" />,
			textClassName: "text-rose-600",
		};
	}

	return {
		node: <Info className="h-7 w-7" />,
		textClassName: "text-zinc-500",
	};
}

function createNotificationSummary(item: NotificationItem): ReactNode {
	if (item.type === "info" || item.type === "violation") {
		return item.title ?? (item.type === "info" ? "お知らせ" : "違反通知");
	}

	const actorText = createActorSummaryText(item.actors, item.actorCount);

	if (item.type === "follow") {
		return `${actorText}があなたをフォローしました`;
	}

	if (item.type === "like") {
		return `${actorText}があなたの投稿をいいねしました`;
	}

	if (item.type === "repost") {
		return `${actorText}があなたの投稿をリポストしました`;
	}

	if (item.type === "reply") {
		return `${actorText}があなたの投稿にリプライしました`;
	}

	if (item.type === "mention") {
		return `${actorText}があなたをメンションしました`;
	}

	return `${actorText}があなたの投稿を引用しました`;
}

function createActorSummaryText(
	actors: NotificationItem["actors"],
	actorCount: number,
) {
	if (actors.length === 0 || actorCount === 0) {
		return "誰か";
	}

	if (actorCount === 1) {
		return actors[0]?.name ?? "誰か";
	}

	if (actorCount === 2) {
		const first = actors[0]?.name ?? "誰か";
		const second = actors[1]?.name ?? "誰か";
		return `${first}と${second}`;
	}

	const first = actors[0]?.name ?? "誰か";
	return `${first}と他${actorCount - 1}人`;
}

function formatRelativeTime(value: string) {
	const timestamp = new Date(value).getTime();
	const diffInSeconds = Math.floor((Date.now() - timestamp) / 1000);

	if (!Number.isFinite(diffInSeconds) || diffInSeconds < 0) {
		return "今";
	}

	if (diffInSeconds < 60) {
		return `${diffInSeconds}秒前`;
	}

	const diffInMinutes = Math.floor(diffInSeconds / 60);
	if (diffInMinutes < 60) {
		return `${diffInMinutes}分前`;
	}

	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) {
		return `${diffInHours}時間前`;
	}

	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 7) {
		return `${diffInDays}日前`;
	}

	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
