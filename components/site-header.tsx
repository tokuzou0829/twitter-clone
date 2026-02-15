"use client";

import Link from "next/link";

import { signOut } from "@/lib/auth-actions";
import { authClient } from "@/lib/auth-client";

export function SiteHeader() {
	const { data: session, isPending } = authClient.useSession();

	return (
		<header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-black/40">
			<div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
				<Link href="/" className="text-lg font-semibold text-zinc-900">
					Next Tokuzou Kit
				</Link>
				<div className="flex items-center gap-4 text-sm">
					{isPending ? (
						<span className="text-zinc-500">Loading...</span>
					) : session?.user ? (
						<div className="flex items-center gap-4">
							<div className="text-right">
								<p className="text-sm font-semibold text-zinc-900">
									{session.user.name ?? "Unnamed"}
								</p>
								<p className="text-xs text-zinc-500">{session.user.email}</p>
							</div>
							<button
								type="button"
								onClick={() => {
									void signOut();
								}}
								className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100"
							>
								Sign out
							</button>
						</div>
					) : (
						<div className="flex items-center gap-3">
							<Link
								href="/login"
								className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
							>
								Log in
							</Link>
							<Link
								href="/signup"
								className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800"
							>
								Sign up
							</Link>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
