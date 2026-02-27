"use client";

import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import { createPost, type PostSummary } from "@/lib/social-api";
import { PostComposer } from "./post-composer";
import { TimelineFeed } from "./timeline-feed";

export function HomePage() {
	const { data: session, isPending } = authClient.useSession();
	const [latestCreatedPost, setLatestCreatedPost] =
		useState<PostSummary | null>(null);

	return (
		<AppShell pageTitle="Home">
			{isPending ? (
				<div className="border-b border-[var(--border-subtle)] px-4 py-4 text-sm text-[var(--text-subtle)]">
					キミのためのタイムラインをつくっています...
				</div>
			) : session?.user ? (
				<PostComposer
					title=""
					placeholder="今どんな気分?"
					submitLabel="Post"
					variant="home"
					onSubmit={async (formData) => {
						const createdPost = await createPost(formData);
						setLatestCreatedPost(createdPost);
					}}
				/>
			) : (
				<section className="border-b border-[var(--border-subtle)] px-4 py-5">
					<p className="text-sm text-[var(--text-subtle)]">
						ログインして、会話に参加しよう!!
					</p>
				</section>
			)}

			<TimelineFeed
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
				newPost={latestCreatedPost}
			/>
		</AppShell>
	);
}
