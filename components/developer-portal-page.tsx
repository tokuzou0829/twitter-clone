"use client";

import {
	Bot,
	CircleDashed,
	FileText,
	KeyRound,
	Link2,
	Lock,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
	type LinkSummary,
	previewLinkCard,
	registerAsDeveloper,
} from "@/lib/social-api";
import { createDisplayHandle } from "@/lib/user-handle";
import { DeveloperApiTokenManager } from "./developer-api-token-manager";
import { LinkPreviewCard } from "./link-preview-card";
import { Modal } from "./modal";

type DeveloperPortalTool = "link-preview" | "api-tokens";

type DeveloperPortalPageProps = {
	tool: DeveloperPortalTool;
};

type DeveloperTool = {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	disabled: boolean;
	href?: string;
};

const DEVELOPER_TOOLS: DeveloperTool[] = [
	{
		id: "link-preview",
		label: "Link Card Preview",
		description: "OGPの表示状態を確認します",
		icon: Link2,
		disabled: false,
		href: "/developer/link-preview",
	},
	{
		id: "api-tokens",
		label: "API Tokens",
		description: "Token発行・失効",
		icon: KeyRound,
		disabled: false,
		href: "/developer/api-tokens",
	},
	{
		id: "developer-docs",
		label: "Developer API Docs",
		description: "仕様とサンプル",
		icon: FileText,
		disabled: false,
		href: "/developer/docs",
	},
	{
		id: "bot-builder",
		label: "BOT Builder",
		description: "近日対応",
		icon: Bot,
		disabled: true,
	},
];

const ACTIVE_HREF_BY_TOOL: Record<DeveloperPortalTool, string> = {
	"link-preview": "/developer/link-preview",
	"api-tokens": "/developer/api-tokens",
};

export function DeveloperPortalPage({ tool }: DeveloperPortalPageProps) {
	const { data: session, isPending } = authClient.useSession();
	const [previewUrl, setPreviewUrl] = useState("");
	const [preview, setPreview] = useState<LinkSummary | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [isPreviewLoading, setIsPreviewLoading] = useState(false);
	const [isOptInModalOpen, setIsOptInModalOpen] = useState(true);
	const [isRegisteringDeveloper, setIsRegisteringDeveloper] = useState(false);
	const [optInError, setOptInError] = useState<string | null>(null);
	const [isDeveloperOptedIn, setIsDeveloperOptedIn] = useState(false);

	const sessionUser = session?.user;
	const sessionUserId = sessionUser?.id ?? null;
	const isDeveloper = Boolean(sessionUser?.isDeveloper) || isDeveloperOptedIn;
	const accountHandle = sessionUser
		? createDisplayHandle({
				handle: sessionUser.handle,
				name: sessionUser.name,
				userId: sessionUser.id,
			})
		: null;
	const accountInitials = createAccountInitials(
		sessionUser?.name,
		accountHandle,
	);

	useEffect(() => {
		if (!sessionUserId || isDeveloper) {
			setIsOptInModalOpen(false);
			return;
		}

		setIsOptInModalOpen(true);
	}, [isDeveloper, sessionUserId]);

	const handleOptInDeveloper = async () => {
		setOptInError(null);
		setIsRegisteringDeveloper(true);

		try {
			const result = await registerAsDeveloper();
			if (!result.isDeveloper) {
				throw new Error("Developer registration failed");
			}

			setIsDeveloperOptedIn(true);
			setIsOptInModalOpen(false);
		} catch (error) {
			if (error instanceof Error) {
				setOptInError(error.message);
			} else {
				setOptInError("開発者登録に失敗しました");
			}
		} finally {
			setIsRegisteringDeveloper(false);
		}
	};

	const handlePreviewSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setPreviewError(null);

		const normalizedUrl = previewUrl.trim();
		if (!normalizedUrl) {
			setPreviewError("URLを入力してください");
			return;
		}

		if (!isDeveloper) {
			setIsOptInModalOpen(true);
			setPreviewError("開発者登録が必要です");
			return;
		}

		setIsPreviewLoading(true);
		try {
			const nextPreview = await previewLinkCard(normalizedUrl);
			setPreview(nextPreview);
		} catch (error) {
			if (error instanceof Error) {
				setPreviewError(error.message);
			} else {
				setPreviewError("プレビューの取得に失敗しました");
			}
		} finally {
			setIsPreviewLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-[#f7f9fb]">
			<header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
				<div className="flex h-12 items-center justify-between px-4 sm:px-6">
					<div className="flex items-center gap-3">
						<p className="text-sm font-bold tracking-tight text-slate-900">
							Developer Portal
						</p>
					</div>
					<div className="flex items-center gap-3 text-xs">
						{sessionUser && !isDeveloper ? (
							<p className="inline-flex items-center gap-1 font-semibold text-amber-700">
								<CircleDashed className="h-3.5 w-3.5" />
								Pending
							</p>
						) : !sessionUser ? (
							<Link
								href="/login"
								className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 transition hover:bg-slate-50"
							>
								ログイン
							</Link>
						) : null}
					</div>
				</div>
			</header>

			{isPending ? (
				<section className="border-b border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
					セッションを確認しています...
				</section>
			) : (
				<div className="grid min-h-[calc(100vh-3rem)] w-full grid-cols-1 lg:grid-cols-[256px_minmax(0,1fr)]">
					<aside className="order-2 border-b border-slate-200 bg-white lg:order-1 lg:border-b-0 lg:border-r">
						<div className="lg:sticky lg:top-12 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
							<section className="border-b border-slate-200 p-4">
								<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
									Account
								</p>
								{sessionUser ? (
									<>
										<div className="mt-3 flex items-center gap-3">
											<div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
												{sessionUser.image ? (
													<Image
														src={sessionUser.image}
														alt={sessionUser.name ?? "Account"}
														fill
														sizes="40px"
														className="object-cover"
													/>
												) : (
													accountInitials
												)}
											</div>
											<div className="min-w-0">
												<p className="truncate text-sm font-semibold text-slate-900">
													{sessionUser.name ?? "Unnamed"}
												</p>
												<p className="truncate text-xs text-slate-500">
													{accountHandle}
												</p>
											</div>
										</div>
										{!isDeveloper ? (
											<p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
												<CircleDashed className="h-3.5 w-3.5" />
												Developer Access Pending
											</p>
										) : null}
										<div className="mt-3 flex flex-wrap gap-2">
											<Link
												href="/users/me"
												className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
											>
												プロフィール
											</Link>
											<Link
												href="/developer/docs"
												className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
											>
												API Docs
											</Link>
											{!isDeveloper ? (
												<button
													type="button"
													onClick={() => setIsOptInModalOpen(true)}
													className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
												>
													開発者登録
												</button>
											) : null}
										</div>
									</>
								) : (
									<div className="mt-3 space-y-3">
										<p className="text-sm text-slate-600">
											Developer Portalはログインユーザー向けです。
										</p>
										<div className="flex flex-wrap gap-2">
											<Link
												href="/login"
												className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
											>
												ログイン
											</Link>
											<Link
												href="/signup"
												className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
											>
												アカウント作成
											</Link>
										</div>
									</div>
								)}
							</section>

							<section className="border-b border-slate-200 p-4">
								<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
									Products
								</p>
								<nav className="mt-2 space-y-1">
									{DEVELOPER_TOOLS.map((toolItem) => {
										const Icon = toolItem.icon;
										const isActive = toolItem.href
											? toolItem.href === ACTIVE_HREF_BY_TOOL[tool]
											: false;
										const className = `flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm ${
											toolItem.disabled
												? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
												: isActive
													? "border-sky-200 bg-sky-50 text-sky-900"
													: "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50"
										}`;

										if (toolItem.href && !toolItem.disabled) {
											return (
												<Link
													key={toolItem.id}
													href={toolItem.href}
													aria-current={isActive ? "page" : undefined}
													className={className}
												>
													<Icon className="mt-0.5 h-4 w-4 shrink-0" />
													<span className="min-w-0">
														<span className="block truncate font-semibold">
															{toolItem.label}
														</span>
														<span className="block text-xs">
															{toolItem.description}
														</span>
													</span>
												</Link>
											);
										}

										return (
											<button
												type="button"
												key={toolItem.id}
												disabled
												className={className}
											>
												<Icon className="mt-0.5 h-4 w-4 shrink-0" />
												<span className="min-w-0">
													<span className="block truncate font-semibold">
														{toolItem.label}
													</span>
													<span className="block text-xs">
														{toolItem.description}
													</span>
												</span>
											</button>
										);
									})}
								</nav>
							</section>

							<section className="p-4 text-xs text-slate-600">
								<p className="font-semibold uppercase tracking-[0.12em] text-slate-500">
									Notice
								</p>
								<ul className="mt-2 space-y-1">
									<li>・API Tokenは発行直後のみ平文が表示されます。</li>
									<li>・BOTビルダーはまもなくリリース予定です。</li>
								</ul>
							</section>
						</div>
					</aside>

					<main className="order-1 bg-white lg:order-2">
						{!sessionUser ? (
							<section className="border-b border-slate-200 px-5 py-8">
								<p className="text-lg font-semibold text-slate-900">
									ログインするとDeveloper Portalを利用できます。
								</p>
								<div className="mt-4 flex flex-wrap gap-2">
									<Link
										href="/login"
										className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
									>
										ログイン
									</Link>
									<Link
										href="/signup"
										className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
									>
										アカウント作成
									</Link>
								</div>
							</section>
						) : tool === "link-preview" ? (
							<>
								<section className="border-b border-slate-200 px-5 py-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div>
											<p className="text-lg font-semibold text-slate-900">
												Link Card Preview
											</p>
											<p className="text-sm text-slate-600">
												URLを入力して最新OGPを確認
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Link
												href="/developer/docs"
												className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
											>
												<FileText className="h-3.5 w-3.5" />
												Docs
											</Link>
											{!isDeveloper ? (
												<button
													type="button"
													onClick={() => setIsOptInModalOpen(true)}
													className="inline-flex items-center gap-1 rounded-md bg-[var(--text-main)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
												>
													<Lock className="h-3.5 w-3.5" />
													開発者として登録
												</button>
											) : null}
										</div>
									</div>
								</section>

								{!isDeveloper ? (
									<section className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
										開発者登録が必要です。登録後すぐに利用できます。
									</section>
								) : null}

								<section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
									<div className="border-b border-slate-200 px-5 py-4 lg:border-b-0 lg:border-r">
										<form onSubmit={handlePreviewSubmit} className="space-y-3">
											<label
												htmlFor="preview-url"
												className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
											>
												Target URL
											</label>
											<div className="flex flex-col gap-2 sm:flex-row">
												<input
													id="preview-url"
													type="url"
													required
													disabled={!isDeveloper || isPreviewLoading}
													value={previewUrl}
													onChange={(event) =>
														setPreviewUrl(event.target.value)
													}
													placeholder="https://example.com/article"
													className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
												/>
												<button
													type="submit"
													disabled={!isDeveloper || isPreviewLoading}
													className="h-10 shrink-0 rounded-md bg-[var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
												>
													{isPreviewLoading ? "更新中..." : "プレビュー更新"}
												</button>
											</div>
										</form>

										{previewError ? (
											<p className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
												{previewError}
											</p>
										) : null}

										<p className="mt-3 text-xs text-slate-600">
											入力URLはサーバー側で再取得され、最新のOGPを確認できます。
										</p>
									</div>

									<div className="px-5 py-4">
										<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
											Preview
										</p>
										{preview ? (
											<div className="max-w-xl">
												<LinkPreviewCard link={preview} />
											</div>
										) : (
											<div className="mt-3 border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
												URLを入力するとここに表示されます。
											</div>
										)}
									</div>
								</section>
							</>
						) : (
							<DeveloperApiTokenManager
								isDeveloper={isDeveloper}
								sessionUserId={sessionUserId}
								onRequireDeveloper={() => setIsOptInModalOpen(true)}
							/>
						)}
					</main>
				</div>
			)}

			{sessionUser && !isDeveloper && isOptInModalOpen ? (
				<Modal
					title="開発者登録"
					onClose={() => setIsOptInModalOpen(false)}
					panelClassName="max-w-lg"
				>
					<div className="space-y-4 px-4 py-4">
						<p className="text-sm text-[var(--text-main)]">
							Developer Portalを使うには開発者登録が必要です。
						</p>
						{optInError ? (
							<p className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
								{optInError}
							</p>
						) : null}
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setIsOptInModalOpen(false)}
								className="rounded-md border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-main)]"
							>
								あとで
							</button>
							<button
								type="button"
								onClick={() => {
									void handleOptInDeveloper();
								}}
								disabled={isRegisteringDeveloper}
								className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isRegisteringDeveloper ? "登録中..." : "開発者として登録"}
							</button>
						</div>
					</div>
				</Modal>
			) : null}
		</div>
	);
}

const createAccountInitials = (
	name: string | null | undefined,
	handle: string | null,
) => {
	const source = (name ?? "").trim();
	if (source.length > 0) {
		const words = source.split(/\s+/u).filter(Boolean);
		const initials = words
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? "")
			.join("");
		if (initials) {
			return initials;
		}
	}

	if (handle) {
		const normalized = handle.replace(/^@/, "").trim();
		if (normalized.length > 0) {
			return normalized.slice(0, 2).toUpperCase();
		}
	}

	return "NU";
};
