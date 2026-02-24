"use client";

import {
	Bell,
	Home,
	LogIn,
	Search,
	Sparkles,
	User,
	UserPlus,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { signOut } from "@/lib/auth-actions";
import { authClient } from "@/lib/auth-client";
import {
	type DiscoverData,
	fetchDiscoverData,
	fetchNotificationUnreadCount,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";

type AppShellProps = {
	pageTitle: string;
	children: ReactNode;
	rightColumn?: ReactNode;
};

type NavItem = {
	label: string;
	href: string;
	icon: ReactNode;
	match: (pathname: string) => boolean;
};

const EMPTY_DISCOVER_DATA: DiscoverData = {
	trends: [],
	suggestedUsers: [],
};

const formatNotificationBadgeCount = (count: number) => {
	return count > 99 ? "99+" : String(count);
};

export function AppShell({ pageTitle, children, rightColumn }: AppShellProps) {
	const pathname = usePathname();
	const { data: session, isPending } = authClient.useSession();
	const [discoverData, setDiscoverData] =
		useState<DiscoverData>(EMPTY_DISCOVER_DATA);
	const [isDiscoverLoading, setIsDiscoverLoading] = useState(true);
	const [discoverError, setDiscoverError] = useState<string | null>(null);
	const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

	const navItems: NavItem[] = session?.user
		? [
				{
					label: "ホーム",
					href: "/",
					icon: <Home className="h-7 w-7" />,
					match: (value) => value === "/",
				},
				{
					label: "検索",
					href: "/search",
					icon: <Search className="h-7 w-7" />,
					match: (value) => value.startsWith("/search"),
				},
				{
					label: "通知",
					href: "/notifications",
					icon: <Bell className="h-7 w-7" />,
					match: (value) => value.startsWith("/notifications"),
				},
				{
					label: "プロフィール",
					href: "/users/me",
					icon: <User className="h-7 w-7" />,
					match: (value) => value.startsWith("/users"),
				},
			]
		: [
				{
					label: "ホーム",
					href: "/",
					icon: <Home className="h-7 w-7" />,
					match: (value) => value === "/",
				},
				{
					label: "検索",
					href: "/search",
					icon: <Search className="h-7 w-7" />,
					match: (value) => value.startsWith("/search"),
				},
				{
					label: "ログイン",
					href: "/login",
					icon: <LogIn className="h-7 w-7" />,
					match: (value) => value === "/login",
				},
				{
					label: "参加する",
					href: "/signup",
					icon: <UserPlus className="h-7 w-7" />,
					match: (value) => value === "/signup",
				},
			];

	const accountHandle = session?.user
		? createDisplayHandle({
				handle: session.user.handle,
				name: session.user.name,
				userId: session.user.id,
			})
		: null;
	const sessionUserId = session?.user?.id ?? null;

	useEffect(() => {
		let ignore = false;

		const loadDiscoverData = async () => {
			setIsDiscoverLoading(true);
			setDiscoverError(null);

			try {
				const nextDiscoverData = await fetchDiscoverData(sessionUserId);
				if (ignore) {
					return;
				}
				setDiscoverData(nextDiscoverData);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setDiscoverError(loadError.message);
				} else {
					setDiscoverError("Failed to load discover data");
				}
			} finally {
				if (!ignore) {
					setIsDiscoverLoading(false);
				}
			}
		};

		void loadDiscoverData();

		return () => {
			ignore = true;
		};
	}, [sessionUserId]);

	useEffect(() => {
		if (!sessionUserId) {
			setNotificationUnreadCount(0);
			return;
		}

		if (pathname.startsWith("/notifications")) {
			setNotificationUnreadCount(0);
			return;
		}

		let ignore = false;

		const loadNotificationUnreadCount = async () => {
			try {
				const response = await fetchNotificationUnreadCount();
				if (ignore) {
					return;
				}
				setNotificationUnreadCount(response.count);
			} catch {
				if (!ignore) {
					setNotificationUnreadCount(0);
				}
			}
		};

		void loadNotificationUnreadCount();

		return () => {
			ignore = true;
		};
	}, [pathname, sessionUserId]);

	const notificationsBadgeCount =
		session?.user && !pathname.startsWith("/notifications")
			? notificationUnreadCount
			: 0;

	const mobileNavGridClassName = "grid-cols-4";

	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-white/95 backdrop-blur md:hidden">
				<div className="mx-auto flex h-14 w-full max-w-[600px] items-center justify-between px-4">
					<Link
						href="/"
						className="text-base font-extrabold tracking-tight text-sky-500"
					>
						Numatter
					</Link>
					{session?.user ? (
						<Link
							href="/users/me"
							className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--text-main)]"
						>
							{accountHandle}
						</Link>
					) : (
						<Link
							href="/login"
							className="rounded-full bg-[var(--brand-primary)] px-3 py-1 text-xs font-semibold text-white"
						>
							ログイン
						</Link>
					)}
				</div>
			</header>

			<div className="mx-auto flex w-full max-w-[1265px] justify-center gap-6 px-0 md:px-4">
				<aside className="hidden h-screen w-[260px] shrink-0 flex-col justify-between py-3 lg:sticky lg:top-0 lg:flex">
					<div className="space-y-2">
						<Link
							href="/"
							className="inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl font-extrabold text-sky-500 transition hover:bg-sky-50"
						>
							<Image src="/logo.png" alt="Numatter" width={24} height={24} />
						</Link>

						<nav className="space-y-1">
							{navItems.map((item) => {
								const isActive = item.match(pathname);
								const badgeCount =
									item.href === "/notifications" ? notificationsBadgeCount : 0;
								return (
									<Link
										key={item.href}
										href={item.href}
										className={`group flex w-fit items-center gap-4 rounded-full px-4 py-3 text-xl text-[var(--text-main)] transition hover:bg-[var(--surface-muted)] ${
											isActive ? "font-extrabold" : "font-medium"
										}`}
									>
										<span className="relative inline-flex text-[var(--text-main)]">
											{item.icon}
											{badgeCount > 0 ? (
												<span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-rose-500 px-1.5 text-center text-[10px] leading-4 font-bold text-white">
													{formatNotificationBadgeCount(badgeCount)}
												</span>
											) : null}
										</span>
										<span>{item.label}</span>
									</Link>
								);
							})}
						</nav>

						{session?.user ? (
							<Link
								href="/#composer"
								className="mt-3 inline-flex w-[220px] items-center justify-center rounded-full bg-[var(--brand-primary)] px-6 py-3 text-base font-extrabold text-white transition hover:bg-[var(--brand-primary-hover)]"
							>
								投稿する
							</Link>
						) : null}
					</div>

					<div className="space-y-3">
						{isPending ? (
							<p className="px-3 text-sm text-[var(--text-subtle)]">
								Loading...
							</p>
						) : session?.user ? (
							<div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
								<div>
									<p className="text-sm font-extrabold text-[var(--text-main)]">
										{session.user.name ?? "Unnamed"}
									</p>
									<p className="text-xs text-[var(--text-subtle)]">
										{accountHandle}
									</p>
								</div>
								<button
									type="button"
									onClick={() => {
										void signOut();
									}}
									className="w-full rounded-full border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--surface-muted)]"
								>
									ログアウト
								</button>
							</div>
						) : (
							<div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
								<p className="text-sm font-semibold text-[var(--text-main)]">
									今すぐに参加しよう！
								</p>
								<div className="space-y-2">
									<Link
										href="/login"
										className="block rounded-full bg-[var(--brand-primary)] px-3 py-2 text-center text-sm font-semibold text-white"
									>
										ログイン
									</Link>
									<Link
										href="/signup"
										className="block rounded-full border border-[var(--border-subtle)] px-3 py-2 text-center text-sm font-semibold text-[var(--text-main)]"
									>
										今すぐ参加する
									</Link>
								</div>
							</div>
						)}
					</div>
				</aside>

				<section className="min-h-screen w-full max-w-[600px] border-x border-[var(--border-subtle)] bg-[var(--surface-main)] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
					<div className="sticky top-0 z-30 hidden border-b border-[var(--border-subtle)] bg-white/95 px-4 py-3 backdrop-blur md:block">
						<p className="text-xl font-extrabold text-[var(--text-main)]">
							{pageTitle}
						</p>
					</div>
					{children}
				</section>

				<aside className="hidden w-[350px] shrink-0 py-3 xl:block">
					{rightColumn ?? (
						<DefaultRightColumn
							trends={discoverData.trends}
							suggestedUsers={discoverData.suggestedUsers}
							isLoading={isDiscoverLoading}
							error={discoverError}
						/>
					)}
				</aside>
			</div>

			<nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
				<div
					className={`mx-auto grid w-full max-w-[600px] ${mobileNavGridClassName}`}
				>
					{navItems.map((item) => {
						const isActive = item.match(pathname);
						const badgeCount =
							item.href === "/notifications" ? notificationsBadgeCount : 0;
						return (
							<Link
								key={item.href}
								href={item.href}
								className={`flex h-14 flex-col items-center justify-center gap-1 text-xs ${
									isActive
										? "font-extrabold text-[var(--text-main)]"
										: "font-medium text-[var(--text-subtle)]"
								}`}
							>
								<span className="relative inline-flex">
									{item.icon}
									{badgeCount > 0 ? (
										<span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] leading-4 font-bold text-white">
											{formatNotificationBadgeCount(badgeCount)}
										</span>
									) : null}
								</span>
								<span>{item.label}</span>
							</Link>
						);
					})}
				</div>
			</nav>
		</div>
	);
}

type DefaultRightColumnProps = {
	trends: DiscoverData["trends"];
	suggestedUsers: DiscoverData["suggestedUsers"];
	isLoading: boolean;
	error: string | null;
};

function DefaultRightColumn({
	trends,
	suggestedUsers,
	isLoading,
	error,
}: DefaultRightColumnProps) {
	const router = useRouter();
	const [searchQuery, setSearchQuery] = useState("");

	return (
		<div className="space-y-4">
			<section className="rounded-2xl bg-[var(--surface-muted)] p-3">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						const normalized = searchQuery.trim();
						router.push(
							normalized
								? `/search?q=${encodeURIComponent(normalized)}`
								: "/search",
						);
					}}
					className="relative block"
				>
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
					<input
						type="search"
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder="Numatterを探索"
						className="h-11 w-full rounded-full border border-transparent bg-[var(--surface-main)] pl-10 pr-4 text-base outline-none transition focus:border-sky-400"
					/>
				</form>
			</section>

			<section className="overflow-hidden rounded-2xl bg-[var(--surface-muted)]">
				<div className="border-b border-[var(--border-subtle)] px-4 py-3">
					<p className="text-xl font-extrabold text-[var(--text-main)]">
						現在のトレンド
					</p>
				</div>
				{error ? (
					<p className="px-4 py-3 text-sm text-rose-600">{error}</p>
				) : isLoading ? (
					<p className="px-4 py-3 text-sm text-[var(--text-subtle)]">
						トレンドを読み込んでいます...
					</p>
				) : trends.length === 0 ? (
					<p className="px-4 py-3 text-sm text-[var(--text-subtle)]">
						現在トレンドになっているハッシュタグはありません。
					</p>
				) : (
					<ul>
						{trends.slice(0, 5).map((trend) => (
							<li key={trend.tag}>
								<Link
									href={`/search?q=${encodeURIComponent(trend.tag)}`}
									className="flex w-full items-center justify-between px-4 py-3 transition hover:bg-white"
								>
									<div>
										<p className="text-xs text-[var(--text-subtle)]">
											トレンド
										</p>
										<p className="text-sm font-bold text-[var(--text-main)]">
											{trend.tag}
										</p>
										<p className="text-xs text-[var(--text-subtle)]">
											{trend.count} 件の投稿
										</p>
									</div>
									<Sparkles className="h-4 w-4 text-sky-500" />
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="overflow-hidden rounded-2xl bg-[var(--surface-muted)]">
				<div className="border-b border-[var(--border-subtle)] px-4 py-3">
					<p className="text-xl font-extrabold text-[var(--text-main)]">
						おすすめユーザー
					</p>
				</div>
				{error ? (
					<p className="px-4 py-3 text-sm text-rose-600">{error}</p>
				) : isLoading ? (
					<p className="px-4 py-3 text-sm text-[var(--text-subtle)]">
						おすすめのユーザーを読み込んでいます...
					</p>
				) : suggestedUsers.length === 0 ? (
					<p className="px-4 py-3 text-sm text-[var(--text-subtle)]">
						現在提案できるユーザーはいません。
					</p>
				) : (
					<ul>
						{suggestedUsers.map((account) => {
							const handle = createDisplayHandle({
								handle: account.handle,
								name: account.name,
								userId: account.id,
							});

							return (
								<li
									key={account.id}
									className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-white"
								>
									<Link
										href={`/users/${account.id}`}
										className="flex min-w-0 items-center gap-3"
									>
										<div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-xs font-bold text-zinc-500">
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
										</div>
									</Link>
									<Link
										href={`/users/${account.id}`}
										className="rounded-full bg-[var(--text-main)] px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
									>
										View
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
