"use client";

import {
	type MouseEvent as ReactMouseEvent,
	type SyntheticEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { LinkSummary } from "@/lib/social-api";

type LinkPreviewCardProps = {
	link: LinkSummary;
};

const YOUTUBE_HOSTNAME_REGEX = /(^|\.)youtube\.com$/u;
const YOUTU_BE_HOSTNAME_REGEX = /(^|\.)youtu\.be$/u;
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/u;

export function LinkPreviewCard({ link }: LinkPreviewCardProps) {
	const title = link.title ?? link.displayUrl;
	const subtitle = link.siteName ?? link.host;
	const youtubePreviewEmbedUrl = useMemo(
		() => createYouTubeEmbedUrl(link.url),
		[link.url],
	);
	const [isYouTubeEmbedVisible, setIsYouTubeEmbedVisible] = useState(false);
	const [isYouTubeIframeLoaded, setIsYouTubeIframeLoaded] = useState(false);
	const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
	const youtubeEmbedUrl = useMemo(() => {
		if (!youtubePreviewEmbedUrl) {
			return null;
		}

		return createYouTubeEmbedUrl(link.url, { autoplay: isYouTubeEmbedVisible });
	}, [isYouTubeEmbedVisible, link.url, youtubePreviewEmbedUrl]);

	const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
		event.stopPropagation();
	};

	const handleYouTubePreviewClick = (
		event: ReactMouseEvent<HTMLButtonElement>,
	) => {
		event.stopPropagation();
		setIsYouTubeIframeLoaded(false);
		setIsYouTubeEmbedVisible(true);
	};

	const playYouTubeVideo = useCallback(() => {
		const iframeWindow = youtubeIframeRef.current?.contentWindow;
		if (!iframeWindow) {
			return;
		}

		iframeWindow.postMessage(
			JSON.stringify({
				event: "command",
				func: "playVideo",
				args: [],
			}),
			"https://www.youtube-nocookie.com",
		);
	}, []);

	const handleYouTubeIframeLoad = (
		event: SyntheticEvent<HTMLIFrameElement>,
	) => {
		event.stopPropagation();
		setIsYouTubeIframeLoaded(true);
		playYouTubeVideo();
	};

	useEffect(() => {
		if (!isYouTubeEmbedVisible || !youtubeEmbedUrl || !isYouTubeIframeLoaded) {
			return;
		}

		playYouTubeVideo();
	}, [
		isYouTubeEmbedVisible,
		youtubeEmbedUrl,
		isYouTubeIframeLoaded,
		playYouTubeVideo,
	]);

	if (youtubeEmbedUrl && !isYouTubeEmbedVisible) {
		return (
			<button
				type="button"
				onClick={handleYouTubePreviewClick}
				data-no-post-nav="true"
				className="group mt-3 block w-full cursor-pointer overflow-hidden rounded-2xl border border-[var(--border-subtle)] text-left transition hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
			>
				{link.imageUrl ? (
					<img
						src={link.imageUrl}
						alt={title}
						className="h-40 w-full object-cover"
					/>
				) : null}
				<div className="space-y-1.5 p-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
						{subtitle}
					</p>
					<p className="line-clamp-2 text-sm font-semibold text-[var(--text-main)]">
						{title}
					</p>
					{link.description ? (
						<p className="line-clamp-2 text-xs text-[var(--text-subtle)]">
							{link.description}
						</p>
					) : null}
					<p className="truncate text-xs text-[var(--text-subtle)] group-hover:text-[var(--text-main)]">
						{link.displayUrl}
					</p>
				</div>
			</button>
		);
	}

	if (youtubeEmbedUrl) {
		return (
			<div
				data-no-post-nav="true"
				className="mt-3 overflow-hidden rounded-2xl border border-[var(--border-subtle)]"
			>
				<div className="aspect-video w-full bg-black">
					<iframe
						ref={youtubeIframeRef}
						src={youtubeEmbedUrl}
						title={`${title} - YouTube`}
						className="h-full w-full"
						loading="lazy"
						onLoad={handleYouTubeIframeLoad}
						referrerPolicy="strict-origin-when-cross-origin"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						allowFullScreen
					/>
				</div>
				<div className="space-y-1.5 p-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
						{subtitle}
					</p>
					<p className="line-clamp-2 text-sm font-semibold text-[var(--text-main)]">
						{title}
					</p>
					{link.description ? (
						<p className="line-clamp-2 text-xs text-[var(--text-subtle)]">
							{link.description}
						</p>
					) : null}
					<p className="truncate text-xs text-[var(--text-subtle)]">
						{link.displayUrl}
					</p>
					<a
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						onClick={handleClick}
						data-no-post-nav="true"
						className="inline-flex text-xs font-semibold text-sky-600 hover:underline"
					>
						YouTubeで開く
					</a>
				</div>
			</div>
		);
	}

	return (
		<a
			href={link.url}
			target="_blank"
			rel="noopener noreferrer"
			onClick={handleClick}
			data-no-post-nav="true"
			className="group mt-3 block overflow-hidden rounded-2xl border border-[var(--border-subtle)] transition hover:bg-[var(--surface-muted)]"
		>
			{link.imageUrl ? (
				<img
					src={link.imageUrl}
					alt={title}
					className="h-40 w-full object-cover"
				/>
			) : null}
			<div className="space-y-1.5 p-3">
				<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
					{subtitle}
				</p>
				<p className="line-clamp-2 text-sm font-semibold text-[var(--text-main)]">
					{title}
				</p>
				{link.description ? (
					<p className="line-clamp-2 text-xs text-[var(--text-subtle)]">
						{link.description}
					</p>
				) : null}
				<p className="truncate text-xs text-[var(--text-subtle)] group-hover:text-[var(--text-main)]">
					{link.displayUrl}
				</p>
			</div>
		</a>
	);
}

const createYouTubeEmbedUrl = (
	urlValue: string,
	options?: { autoplay?: boolean },
) => {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(urlValue);
	} catch {
		return null;
	}

	const videoId = extractYouTubeVideoId(parsedUrl);
	if (!videoId) {
		return null;
	}

	const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
	const startTimeSeconds = extractStartTimeSeconds(parsedUrl);
	if (startTimeSeconds) {
		embedUrl.searchParams.set("start", String(startTimeSeconds));
	}

	embedUrl.searchParams.set("enablejsapi", "1");
	embedUrl.searchParams.set("playsinline", "1");

	if (options?.autoplay) {
		embedUrl.searchParams.set("autoplay", "1");
		embedUrl.searchParams.set("mute", "1");
	}

	return embedUrl.toString();
};

const extractYouTubeVideoId = (parsedUrl: URL) => {
	const hostname = parsedUrl.hostname.toLowerCase();

	if (YOUTU_BE_HOSTNAME_REGEX.test(hostname)) {
		const shortVideoId =
			parsedUrl.pathname.split("/").filter(Boolean)[0] ?? null;
		return sanitizeYouTubeVideoId(shortVideoId);
	}

	if (!YOUTUBE_HOSTNAME_REGEX.test(hostname)) {
		return null;
	}

	const [firstSegment, secondSegment] = parsedUrl.pathname
		.split("/")
		.filter(Boolean);
	if (firstSegment === "watch") {
		return sanitizeYouTubeVideoId(parsedUrl.searchParams.get("v"));
	}

	if (!firstSegment || !secondSegment) {
		return null;
	}

	if (
		firstSegment !== "embed" &&
		firstSegment !== "shorts" &&
		firstSegment !== "live" &&
		firstSegment !== "v"
	) {
		return null;
	}

	return sanitizeYouTubeVideoId(secondSegment);
};

const sanitizeYouTubeVideoId = (value: string | null) => {
	if (!value) {
		return null;
	}

	const normalized = value.trim();
	if (!YOUTUBE_VIDEO_ID_REGEX.test(normalized)) {
		return null;
	}

	return normalized;
};

const extractStartTimeSeconds = (parsedUrl: URL) => {
	const rawStartValue =
		parsedUrl.searchParams.get("start") ?? parsedUrl.searchParams.get("t");
	if (!rawStartValue) {
		return null;
	}

	const trimmed = rawStartValue.trim().toLowerCase();
	if (!trimmed) {
		return null;
	}

	if (/^\d+$/u.test(trimmed)) {
		const seconds = Number.parseInt(trimmed, 10);
		return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
	}

	const matched = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/u);
	if (!matched) {
		return null;
	}

	const hours = Number.parseInt(matched[1] ?? "0", 10);
	const minutes = Number.parseInt(matched[2] ?? "0", 10);
	const seconds = Number.parseInt(matched[3] ?? "0", 10);
	const totalSeconds = hours * 3600 + minutes * 60 + seconds;

	return Number.isFinite(totalSeconds) && totalSeconds > 0
		? totalSeconds
		: null;
};
