"use client";

import { Check, Code2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
	EMBED_ALIGNS,
	EMBED_CARDS,
	EMBED_CONVERSATIONS,
	EMBED_THEMES,
	type EmbedStyleOptions,
	parseEmbedStyleOptions,
	toEmbedStyleSearchParams,
} from "@/lib/embed";

type DeveloperEmbedStudioProps = {
	isDeveloper: boolean;
	sessionUserId: string | null;
	onRequireDeveloper: () => void;
};

type EmbedTargetType = "post" | "user" | "search";

type CopyStatus = "idle" | "copied" | "error";

const EMBED_TARGET_TYPES: Array<{
	id: EmbedTargetType;
	label: string;
	description: string;
}> = [
	{
		id: "post",
		label: "Post",
		description: "単一投稿を埋め込み",
	},
	{
		id: "user",
		label: "User",
		description: "プロフィールと最近の投稿を埋め込み",
	},
	{
		id: "search",
		label: "Search",
		description: "検索結果を埋め込み",
	},
];

const COPY_STATUS_RESET_MS = 1800;

export function DeveloperEmbedStudio({
	isDeveloper,
	sessionUserId,
	onRequireDeveloper,
}: DeveloperEmbedStudioProps) {
	const searchParams = useSearchParams();
	const [targetType, setTargetType] = useState<EmbedTargetType>(() => {
		const type = searchParams.get("type");
		if (type === "post" || type === "user" || type === "search") {
			return type;
		}

		return "post";
	});
	const [postIdInput, setPostIdInput] = useState(
		() => searchParams.get("postId") ?? "",
	);
	const [userInput, setUserInput] = useState(
		() => searchParams.get("user") ?? "",
	);
	const [searchInput, setSearchInput] = useState(
		() => searchParams.get("q") ?? "",
	);
	const [styleOptions, setStyleOptions] = useState<EmbedStyleOptions>(() =>
		parseEmbedStyleOptions(searchParams),
	);
	const origin = typeof window === "undefined" ? "" : window.location.origin;
	const [urlCopyStatus, setUrlCopyStatus] = useState<CopyStatus>("idle");
	const [codeCopyStatus, setCodeCopyStatus] = useState<CopyStatus>("idle");

	useEffect(() => {
		if (urlCopyStatus === "idle") {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setUrlCopyStatus("idle");
		}, COPY_STATUS_RESET_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [urlCopyStatus]);

	useEffect(() => {
		if (codeCopyStatus === "idle") {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setCodeCopyStatus("idle");
		}, COPY_STATUS_RESET_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [codeCopyStatus]);

	const relativeEmbedUrl = useMemo(() => {
		const baseUrl = createBaseEmbedUrl({
			targetType,
			postIdInput,
			userInput,
			searchInput,
		});

		if (!baseUrl) {
			return null;
		}

		const [path, rawQuery] = baseUrl.split("?");
		const mergedQuery = new URLSearchParams(rawQuery ?? "");
		const styleQuery = toEmbedStyleSearchParams(styleOptions);

		for (const [key, value] of styleQuery.entries()) {
			mergedQuery.set(key, value);
		}

		const queryString = mergedQuery.toString();
		return queryString ? `${path}?${queryString}` : path;
	}, [targetType, postIdInput, userInput, searchInput, styleOptions]);

	const absoluteEmbedUrl = useMemo(() => {
		if (!relativeEmbedUrl) {
			return null;
		}

		if (!origin) {
			return relativeEmbedUrl;
		}

		return new URL(relativeEmbedUrl, origin).toString();
	}, [origin, relativeEmbedUrl]);

	const iframeCode = useMemo(() => {
		if (!absoluteEmbedUrl) {
			return null;
		}

		const frameHeight =
			targetType === "post"
				? styleOptions.conversation === "all"
					? Math.max(560, 180 + styleOptions.postLimit * 140)
					: 460
				: targetType === "user"
					? Math.max(620, 220 + styleOptions.postLimit * 140)
					: Math.max(560, 220 + styleOptions.postLimit * 130);
		const referrerPolicy = styleOptions.dnt
			? "no-referrer"
			: "no-referrer-when-downgrade";
		const scrolling = styleOptions.chrome.noscrollbar ? "no" : "yes";

		return `<iframe src="${absoluteEmbedUrl}" width="${styleOptions.width}" height="${frameHeight}" style="border:0;max-width:100%;" loading="lazy" scrolling="${scrolling}" referrerpolicy="${referrerPolicy}" allowtransparency="${styleOptions.chrome.transparent ? "true" : "false"}"></iframe>`;
	}, [absoluteEmbedUrl, styleOptions, targetType]);

	const previewHeight = useMemo(() => {
		if (targetType === "post") {
			if (styleOptions.conversation === "all") {
				return Math.max(620, 220 + styleOptions.postLimit * 145);
			}

			return 520;
		}

		if (targetType === "user") {
			return Math.max(700, 260 + styleOptions.postLimit * 140);
		}

		return Math.max(640, 250 + styleOptions.postLimit * 130);
	}, [styleOptions.conversation, styleOptions.postLimit, targetType]);

	if (!sessionUserId) {
		return (
			<section className="border-b border-slate-200 px-5 py-4">
				<p className="text-lg font-semibold text-slate-900">Embed Studio</p>
				<p className="mt-2 text-sm text-slate-600">
					ログインすると埋め込みURLの編集とプレビューが利用できます。
				</p>
			</section>
		);
	}

	if (!isDeveloper) {
		return (
			<section className="border-b border-slate-200 px-5 py-4">
				<p className="text-lg font-semibold text-slate-900">Embed Studio</p>
				<p className="mt-2 text-sm text-slate-600">
					埋め込み設定の編集には開発者登録が必要です。
				</p>
				<button
					type="button"
					onClick={onRequireDeveloper}
					className="mt-3 rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
				>
					開発者として登録
				</button>
			</section>
		);
	}

	return (
		<section className="border-b border-slate-200 px-5 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-lg font-semibold text-slate-900">Embed Studio</p>
					<p className="text-sm text-slate-600">
						Numatter埋め込み（theme/cards/conversation/chrome/width/postLimit）をカスタマイズできます。
					</p>
				</div>
				<span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
					<Code2 className="h-3.5 w-3.5" />
					Live Preview
				</span>
			</div>

			<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
				<div className="space-y-4">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
							Target Type
						</p>
						<div className="mt-2 grid gap-2 sm:grid-cols-3">
							{EMBED_TARGET_TYPES.map((item) => {
								const isActive = item.id === targetType;
								return (
									<button
										type="button"
										key={item.id}
										onClick={() => setTargetType(item.id)}
										className={`rounded-md border px-3 py-2 text-left transition ${
											isActive
												? "border-sky-300 bg-sky-50 text-sky-900"
												: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
										}`}
									>
										<p className="text-sm font-semibold">{item.label}</p>
										<p className="mt-0.5 text-xs text-slate-500">
											{item.description}
										</p>
									</button>
								);
							})}
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
							Target
						</p>
						{targetType === "post" ? (
							<input
								type="text"
								value={postIdInput}
								onChange={(event) => setPostIdInput(event.target.value)}
								placeholder="post id"
								className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
							/>
						) : null}
						{targetType === "user" ? (
							<input
								type="text"
								value={userInput}
								onChange={(event) => setUserInput(event.target.value)}
								placeholder="@handle or user id"
								className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
							/>
						) : null}
						{targetType === "search" ? (
							<input
								type="text"
								value={searchInput}
								onChange={(event) => setSearchInput(event.target.value)}
								placeholder="search keyword"
								className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
							/>
						) : null}
					</div>

					<div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
							Customization
						</p>
						<div className="grid gap-2 sm:grid-cols-2">
							<label className="text-xs font-semibold text-slate-600">
								Theme
								<select
									value={styleOptions.theme}
									onChange={(event) => {
										const nextTheme = event.target.value;
										if (
											!EMBED_THEMES.includes(
												nextTheme as (typeof EMBED_THEMES)[number],
											)
										) {
											return;
										}
										setStyleOptions((current) => ({
											...current,
											theme: nextTheme as EmbedStyleOptions["theme"],
										}));
									}}
									className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
								>
									{EMBED_THEMES.map((theme) => (
										<option key={theme} value={theme}>
											{theme[0]?.toUpperCase()}
											{theme.slice(1)}
										</option>
									))}
								</select>
							</label>

							<label className="text-xs font-semibold text-slate-600">
								Cards
								<select
									value={styleOptions.cards}
									onChange={(event) => {
										const nextCards = event.target.value;
										if (
											!EMBED_CARDS.includes(
												nextCards as (typeof EMBED_CARDS)[number],
											)
										) {
											return;
										}

										setStyleOptions((current) => ({
											...current,
											cards: nextCards as EmbedStyleOptions["cards"],
										}));
									}}
									className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
								>
									<option value="visible">Visible</option>
									<option value="hidden">Hidden</option>
								</select>
							</label>
						</div>

						<div className="grid gap-2 sm:grid-cols-2">
							<label className="text-xs font-semibold text-slate-600">
								Conversation
								<select
									value={styleOptions.conversation}
									onChange={(event) => {
										const nextConversation = event.target.value;
										if (
											!EMBED_CONVERSATIONS.includes(
												nextConversation as (typeof EMBED_CONVERSATIONS)[number],
											)
										) {
											return;
										}

										setStyleOptions((current) => ({
											...current,
											conversation:
												nextConversation as EmbedStyleOptions["conversation"],
										}));
									}}
									className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
								>
									<option value="all">All</option>
									<option value="none">None</option>
								</select>
							</label>
							<label className="text-xs font-semibold text-slate-600">
								Align
								<select
									value={styleOptions.align}
									onChange={(event) => {
										const nextAlign = event.target.value;
										if (
											!EMBED_ALIGNS.includes(
												nextAlign as (typeof EMBED_ALIGNS)[number],
											)
										) {
											return;
										}

										setStyleOptions((current) => ({
											...current,
											align: nextAlign as EmbedStyleOptions["align"],
										}));
									}}
									className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-sky-500"
								>
									<option value="left">Left</option>
									<option value="center">Center</option>
									<option value="right">Right</option>
								</select>
							</label>
						</div>

						<div className="grid gap-2 sm:grid-cols-2">
							<label className="text-xs font-semibold text-slate-600">
								Width ({styleOptions.width}px)
								<input
									type="range"
									min={220}
									max={550}
									value={styleOptions.width}
									onChange={(event) => {
										const nextWidth = Number.parseInt(event.target.value, 10);
										setStyleOptions((current) => ({
											...current,
											width: Number.isFinite(nextWidth)
												? nextWidth
												: current.width,
										}));
									}}
									className="mt-2 w-full"
								/>
							</label>

							<label className="text-xs font-semibold text-slate-600">
								Post Limit ({styleOptions.postLimit})
								<input
									type="range"
									min={1}
									max={20}
									value={styleOptions.postLimit}
									onChange={(event) => {
										const nextLimit = Number.parseInt(event.target.value, 10);
										setStyleOptions((current) => ({
											...current,
											postLimit: Number.isFinite(nextLimit)
												? nextLimit
												: current.postLimit,
											limit: Number.isFinite(nextLimit)
												? nextLimit
												: current.limit,
										}));
									}}
									className="mt-2 w-full"
								/>
							</label>
						</div>

						<div className="space-y-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								Chrome
							</p>
							<div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
								<ToggleField
									label="No Header"
									checked={styleOptions.chrome.noheader}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											chrome: {
												...current.chrome,
												noheader: checked,
											},
										}));
									}}
								/>
								<ToggleField
									label="No Footer"
									checked={styleOptions.chrome.nofooter}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											chrome: {
												...current.chrome,
												nofooter: checked,
											},
										}));
									}}
								/>
								<ToggleField
									label="No Borders"
									checked={styleOptions.chrome.noborders}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											border: !checked,
											chrome: {
												...current.chrome,
												noborders: checked,
											},
										}));
									}}
								/>
								<ToggleField
									label="Transparent"
									checked={styleOptions.chrome.transparent}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											chrome: {
												...current.chrome,
												transparent: checked,
											},
										}));
									}}
								/>
								<ToggleField
									label="No Scrollbar"
									checked={styleOptions.chrome.noscrollbar}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											chrome: {
												...current.chrome,
												noscrollbar: checked,
											},
										}));
									}}
								/>
								<ToggleField
									label="DNT"
									checked={styleOptions.dnt}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											dnt: checked,
										}));
									}}
								/>
								<ToggleField
									label="Stats"
									checked={styleOptions.showStats}
									onChange={(checked) => {
										setStyleOptions((current) => ({
											...current,
											showStats: checked,
										}));
									}}
								/>
							</div>
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
							Embed URL
						</p>
						<div className="flex gap-2">
							<input
								type="text"
								readOnly
								value={absoluteEmbedUrl ?? ""}
								placeholder="targetを入力するとURLが生成されます"
								className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none"
							/>
							<button
								type="button"
								onClick={() => {
									void copyEmbedText(absoluteEmbedUrl, setUrlCopyStatus);
								}}
								disabled={!absoluteEmbedUrl}
								className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{urlCopyStatus === "copied" ? (
									<Check className="h-3.5 w-3.5" />
								) : urlCopyStatus === "error" ? (
									<Loader2 className="h-3.5 w-3.5" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
								{urlCopyStatus === "copied"
									? "Copied"
									: urlCopyStatus === "error"
										? "Retry"
										: "Copy"}
							</button>
						</div>
						<div className="flex gap-2">
							<textarea
								readOnly
								value={iframeCode ?? ""}
								placeholder="iframeコードはここに表示されます"
								rows={3}
								className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none"
							/>
							<button
								type="button"
								onClick={() => {
									void copyEmbedText(iframeCode, setCodeCopyStatus);
								}}
								disabled={!iframeCode}
								className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{codeCopyStatus === "copied" ? (
									<Check className="h-3.5 w-3.5" />
								) : codeCopyStatus === "error" ? (
									<Loader2 className="h-3.5 w-3.5" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
								{codeCopyStatus === "copied"
									? "Copied"
									: codeCopyStatus === "error"
										? "Retry"
										: "Copy"}
							</button>
						</div>
					</div>
				</div>

				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
						Preview
					</p>
					{relativeEmbedUrl ? (
						<>
							<div className="overflow-hidden rounded-md border border-slate-300 bg-white">
								<iframe
									title="Embed preview"
									src={relativeEmbedUrl}
									className="w-full"
									style={{ height: `${previewHeight}px` }}
								/>
							</div>
							{absoluteEmbedUrl ? (
								<a
									href={absoluteEmbedUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
								>
									<ExternalLink className="h-3.5 w-3.5" />
									新しいタブで埋め込みを開く
								</a>
							) : null}
						</>
					) : (
						<div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
							ターゲットを入力するとここにプレビューが表示されます。
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

type ToggleFieldProps = {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
};

function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
	const statusClassName = checked
		? "border-sky-300 bg-sky-50 text-sky-900"
		: "border-slate-300 bg-white text-slate-600";

	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className={`inline-flex h-9 items-center justify-center rounded-md border text-xs font-semibold transition ${statusClassName}`}
		>
			{label}
		</button>
	);
}

const createBaseEmbedUrl = (params: {
	targetType: EmbedTargetType;
	postIdInput: string;
	userInput: string;
	searchInput: string;
}) => {
	if (params.targetType === "post") {
		const normalizedPostId = params.postIdInput.trim();
		if (!normalizedPostId) {
			return null;
		}
		return `/embed/post/${encodeURIComponent(normalizedPostId)}`;
	}

	if (params.targetType === "user") {
		const normalizedUser = params.userInput.trim();
		if (!normalizedUser) {
			return null;
		}
		return `/embed/user/${encodeURIComponent(normalizedUser)}`;
	}

	const normalizedQuery = params.searchInput.trim();
	if (!normalizedQuery) {
		return null;
	}

	return `/embed/search?q=${encodeURIComponent(normalizedQuery)}`;
};

const copyEmbedText = async (
	value: string | null,
	setCopyStatus: (status: CopyStatus) => void,
) => {
	if (!value) {
		return;
	}

	const copied = await copyTextToClipboard(value);
	setCopyStatus(copied ? "copied" : "error");
};

const copyTextToClipboard = async (value: string) => {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = value;
		textarea.setAttribute("readonly", "true");
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		document.body.append(textarea);
		textarea.select();

		const copied = document.execCommand("copy");
		textarea.remove();
		return copied;
	}
};
