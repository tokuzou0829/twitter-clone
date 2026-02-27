"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import {
	fetchUserProfile,
	type ProfileResponse,
	type ProfileTimelineTab,
	toggleFollow,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { Modal } from "./modal";
import { ProfileSettingsCard } from "./profile-settings-card";
import { TimelineFeed } from "./timeline-feed";

type UserProfilePageProps = {
	userId: string;
};

const PROFILE_TABS: Array<{ id: ProfileTimelineTab; label: string }> = [
	{ id: "posts", label: "投稿" },
	{ id: "replies", label: "リプライ" },
	{ id: "media", label: "メディア" },
	{ id: "likes", label: "いいね" },
];

export function UserProfilePage({ userId }: UserProfilePageProps) {
	const { data: session } = authClient.useSession();
	const [profile, setProfile] = useState<ProfileResponse | null>(null);
	const [activeTab, setActiveTab] = useState<ProfileTimelineTab>("posts");
	const [isLoading, setIsLoading] = useState(true);
	const [isTogglingFollow, setIsTogglingFollow] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let ignore = false;
		setActiveTab("posts");

		const load = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const nextProfile = await fetchUserProfile(userId);
				if (ignore) {
					return;
				}
				setProfile(nextProfile);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setError(loadError.message);
				} else {
					setError("Failed to load profile");
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
	}, [userId]);

	const handleFollowToggle = async () => {
		if (!profile || profile.viewer.isSelf) {
			return;
		}

		setIsTogglingFollow(true);
		setError(null);
		try {
			const updated = await toggleFollow(userId, profile.viewer.isFollowing);
			setProfile(updated);
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setError(toggleError.message);
			}
		} finally {
			setIsTogglingFollow(false);
		}
	};

	if (isLoading) {
		return (
			<AppShell pageTitle="Profile">
				<section className="border-b border-[var(--border-subtle)] px-4 py-6 text-sm text-[var(--text-subtle)]">
					プロフィールを読み込んでいます...
				</section>
			</AppShell>
		);
	}

	if (error || !profile) {
		return (
			<AppShell pageTitle="Profile">
				<section className="border-b border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
					{error ?? "Profile not found"}
				</section>
			</AppShell>
		);
	}

	const profileHandle = createDisplayHandle({
		handle: profile.user.handle,
		name: profile.user.name,
		userId: profile.user.id,
	});

	const joinedDate = new Date(profile.user.createdAt).toLocaleDateString(
		undefined,
		{
			year: "numeric",
			month: "long",
		},
	);

	return (
		<AppShell pageTitle={profile.user.name}>
			<section className="border-b border-[var(--border-subtle)]">
				<div className="h-44 bg-[linear-gradient(135deg,#1d9bf0,#198ad0,#0f5f8a)]">
					{profile.user.bannerImage ? (
						<img
							src={profile.user.bannerImage}
							alt="Profile cover"
							className="h-full w-full object-cover"
						/>
					) : null}
				</div>

				<div className="px-4 pb-4">
					<div className="-mt-16 flex items-end justify-between gap-2">
						<div className="h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-zinc-100">
							{profile.user.image ? (
								<img
									src={profile.user.image}
									alt={profile.user.name}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center text-xl font-extrabold text-zinc-500">
									{profile.user.name.slice(0, 2).toUpperCase()}
								</div>
							)}
						</div>

						{profile.viewer.isSelf ? (
							<button
								type="button"
								onClick={() => setIsSettingsOpen(true)}
								className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-main)] transition hover:bg-[var(--surface-muted)]"
							>
								編集
							</button>
						) : (
							<button
								type="button"
								onClick={() => {
									void handleFollowToggle();
								}}
								disabled={isTogglingFollow || !session?.user}
								className={`rounded-full px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
									profile.viewer.isFollowing
										? "border border-[var(--border-subtle)] text-[var(--text-main)] hover:bg-[var(--surface-muted)]"
										: "bg-[var(--text-main)] text-white hover:opacity-90"
								}`}
							>
								{!session?.user
									? "ログインしてフォロー"
									: profile.viewer.isFollowing
										? "フォロー中"
										: "フォロー"}
							</button>
						)}
					</div>

					<div className="mt-3 space-y-2">
						<h1 className="text-xl font-extrabold text-[var(--text-main)]">
							{profile.user.name}
						</h1>
						<p className="text-sm text-[var(--text-subtle)]">{profileHandle}</p>
						{profile.user.bio ? (
							<p className="whitespace-pre-wrap text-[15px] leading-6 text-[var(--text-main)]">
								{profile.user.bio}
							</p>
						) : null}
						<p className="text-sm text-[var(--text-subtle)]">
							{joinedDate}に参加
						</p>
					</div>

					<div className="mt-3 flex flex-wrap gap-4 text-sm">
						<Link
							href={`/users/${profile.user.id}/following`}
							className="rounded-md transition hover:bg-[var(--surface-muted)]"
						>
							<strong className="font-bold text-[var(--text-main)]">
								{profile.stats.following}
							</strong>{" "}
							<span className="text-[var(--text-subtle)]">フォロー中</span>
						</Link>
						<Link
							href={`/users/${profile.user.id}/followers`}
							className="rounded-md transition hover:bg-[var(--surface-muted)]"
						>
							<strong className="font-bold text-[var(--text-main)]">
								{profile.stats.followers}
							</strong>{" "}
							<span className="text-[var(--text-subtle)]">フォロワー</span>
						</Link>
						<span>
							<strong className="font-bold text-[var(--text-main)]">
								{profile.stats.posts}
							</strong>{" "}
							<span className="text-[var(--text-subtle)]">投稿</span>
						</span>
					</div>
				</div>

				<div className="grid grid-cols-4 border-t border-[var(--border-subtle)]">
					{PROFILE_TABS.map((tab) => {
						const isActive = tab.id === activeTab;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={`border-b-2 px-2 py-3 text-center text-sm font-bold transition ${
									isActive
										? "border-sky-500 text-[var(--text-main)]"
										: "border-transparent text-[var(--text-subtle)] hover:bg-[var(--surface-muted)]"
								}`}
							>
								{tab.label}
							</button>
						);
					})}
				</div>
			</section>

			{profile.viewer.isSelf && isSettingsOpen ? (
				<Modal
					title="プロフィールを編集"
					onClose={() => setIsSettingsOpen(false)}
					panelClassName="max-w-2xl"
				>
					<ProfileSettingsCard
						onSaved={(updatedProfile) => {
							setProfile(updatedProfile);
							setIsSettingsOpen(false);
						}}
					/>
				</Modal>
			) : null}

			<TimelineFeed
				userId={userId}
				sessionUserId={session?.user.id ?? null}
				sessionUserSummary={
					session?.user
						? {
								id: session.user.id,
								name: session.user.name,
								handle: session.user.handle ?? null,
								image: session.user.image ?? null,
								bio: null,
								bannerImage: null,
							}
						: null
				}
				profileTab={activeTab}
			/>
		</AppShell>
	);
}
