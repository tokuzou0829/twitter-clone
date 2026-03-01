"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Modal } from "./modal";

type PostShareButtonProps = {
	postId: string;
	updatedAt: string;
};

const MOBILE_VIEWPORT_QUERY = "(max-width: 639px)";
const COPY_FEEDBACK_DURATION_MS = 1800;
const POPOVER_WIDTH_PX = 320;
const POPOVER_VIEWPORT_PADDING_PX = 12;
const POPOVER_GAP_PX = 10;

type PopoverPosition = {
	top: number;
	left: number;
	width: number;
};

type OgpPreviewLoadState = "idle" | "loading" | "loaded" | "error";

export function PostShareButton({ postId, updatedAt }: PostShareButtonProps) {
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const [isMobileViewport, setIsMobileViewport] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}

		return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
	});
	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
		"idle",
	);
	const [ogpPreviewLoadState, setOgpPreviewLoadState] =
		useState<OgpPreviewLoadState>("idle");
	const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
		top: 0,
		left: 0,
		width: POPOVER_WIDTH_PX,
	});
	const origin = typeof window === "undefined" ? "" : window.location.origin;
	const canUsePortal = typeof document !== "undefined";

	const postPath = useMemo(() => {
		return `/posts/${encodeURIComponent(postId)}`;
	}, [postId]);

	const shareUrl = useMemo(() => {
		if (!origin) {
			return postPath;
		}

		return new URL(postPath, origin).toString();
	}, [origin, postPath]);

	const ogImageUrl = useMemo(() => {
		const encodedUpdatedAt = encodeURIComponent(updatedAt);
		const imagePath = `${postPath}/opengraph-image?v=${encodedUpdatedAt}`;
		if (!origin) {
			return imagePath;
		}

		return new URL(imagePath, origin).toString();
	}, [origin, postPath, updatedAt]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const mediaQueryList = window.matchMedia(MOBILE_VIEWPORT_QUERY);
		const handleViewportChange = (event: MediaQueryListEvent) => {
			setIsMobileViewport(event.matches);
			if (event.matches) {
				setIsPopoverOpen(false);
			}
		};

		mediaQueryList.addEventListener("change", handleViewportChange);

		return () => {
			mediaQueryList.removeEventListener("change", handleViewportChange);
		};
	}, []);

	const updatePopoverPosition = useCallback(() => {
		if (!buttonRef.current || typeof window === "undefined") {
			return;
		}

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const buttonRect = buttonRef.current.getBoundingClientRect();
		const width = Math.max(
			1,
			Math.min(
				POPOVER_WIDTH_PX,
				viewportWidth - POPOVER_VIEWPORT_PADDING_PX * 2,
			),
		);
		const left = clampValue(
			buttonRect.right - width,
			POPOVER_VIEWPORT_PADDING_PX,
			viewportWidth - width - POPOVER_VIEWPORT_PADDING_PX,
		);

		const popoverHeight = popoverRef.current?.offsetHeight ?? 0;
		if (popoverHeight <= 0) {
			setPopoverPosition({
				top: buttonRect.bottom + POPOVER_GAP_PX,
				left,
				width,
			});
			return;
		}

		const minTop = POPOVER_VIEWPORT_PADDING_PX;
		const maxTop = Math.max(
			minTop,
			viewportHeight - popoverHeight - POPOVER_VIEWPORT_PADDING_PX,
		);
		const topIfAbove = buttonRect.top - popoverHeight - POPOVER_GAP_PX;
		const topIfBelow = buttonRect.bottom + POPOVER_GAP_PX;
		const canPlaceAbove = topIfAbove >= minTop;
		const canPlaceBelow = topIfBelow <= maxTop;

		let top = topIfAbove;
		if (canPlaceAbove) {
			top = topIfAbove;
		} else if (canPlaceBelow) {
			top = topIfBelow;
		} else {
			const spaceAbove = buttonRect.top - POPOVER_GAP_PX - minTop;
			const spaceBelow = maxTop - topIfBelow;
			top = spaceBelow >= spaceAbove ? topIfBelow : topIfAbove;
		}

		setPopoverPosition({
			top: clampValue(top, minTop, maxTop),
			left,
			width,
		});
	}, []);

	useEffect(() => {
		if (!isPopoverOpen || isMobileViewport) {
			return;
		}

		const closePopoverOnOutsideClick = (event: MouseEvent) => {
			if (!(event.target instanceof Node)) {
				return;
			}

			if (buttonRef.current?.contains(event.target)) {
				return;
			}

			if (popoverRef.current?.contains(event.target)) {
				return;
			}

			setIsPopoverOpen(false);
		};

		const closePopoverOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsPopoverOpen(false);
			}
		};

		updatePopoverPosition();
		window.addEventListener("resize", updatePopoverPosition);
		window.addEventListener("scroll", updatePopoverPosition, true);
		window.addEventListener("mousedown", closePopoverOnOutsideClick);
		window.addEventListener("keydown", closePopoverOnEscape);

		return () => {
			window.removeEventListener("resize", updatePopoverPosition);
			window.removeEventListener("scroll", updatePopoverPosition, true);
			window.removeEventListener("mousedown", closePopoverOnOutsideClick);
			window.removeEventListener("keydown", closePopoverOnEscape);
		};
	}, [isMobileViewport, isPopoverOpen, updatePopoverPosition]);

	useEffect(() => {
		if (copyState === "idle") {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setCopyState("idle");
		}, COPY_FEEDBACK_DURATION_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [copyState]);

	const handleOgpPreviewLoad = () => {
		setOgpPreviewLoadState("loaded");
		if (!isMobileViewport) {
			window.requestAnimationFrame(updatePopoverPosition);
		}
	};

	const handleOgpPreviewError = () => {
		setOgpPreviewLoadState("error");
		if (!isMobileViewport) {
			window.requestAnimationFrame(updatePopoverPosition);
		}
	};

	const handleToggleShareUi = () => {
		if (isMobileViewport) {
			setOgpPreviewLoadState("loading");
			setIsModalOpen(true);
			setIsPopoverOpen(false);
			return;
		}

		setIsPopoverOpen((current) => {
			const next = !current;
			if (next) {
				setOgpPreviewLoadState("loading");
				updatePopoverPosition();
			}
			return next;
		});
		setIsModalOpen(false);
	};

	const handleCopyLink = async () => {
		const copied = await copyTextToClipboard(shareUrl);
		setCopyState(copied ? "copied" : "error");
	};

	return (
		<div className="relative" data-no-post-nav="true">
			<button
				ref={buttonRef}
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					handleToggleShareUi();
				}}
				aria-label="共有"
				aria-expanded={isPopoverOpen || isModalOpen}
				className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:bg-sky-50 hover:text-sky-600"
			>
				<Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
			</button>

			{canUsePortal && isPopoverOpen && !isMobileViewport
				? createPortal(
						<div
							ref={popoverRef}
							data-no-post-nav="true"
							style={{
								top: `${popoverPosition.top}px`,
								left: `${popoverPosition.left}px`,
								width: `${popoverPosition.width}px`,
							}}
							className="fixed z-[90] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3 shadow-[0_12px_30px_rgba(15,20,25,0.28)]"
							role="dialog"
							aria-label="投稿の共有メニュー"
						>
							<p className="text-sm font-bold text-[var(--text-main)]">
								この投稿を共有
							</p>
							<OgpPreview
								src={ogImageUrl}
								loadState={ogpPreviewLoadState}
								onLoad={handleOgpPreviewLoad}
								onError={handleOgpPreviewError}
								className="mt-2"
							/>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									void handleCopyLink();
								}}
								className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
							>
								{copyState === "copied" ? (
									<Check className="h-4 w-4" />
								) : (
									<Copy className="h-4 w-4" />
								)}
								{copyState === "copied" ? "コピーしました" : "リンクをコピー"}
							</button>
							{copyState === "error" ? (
								<p className="mt-2 text-xs text-rose-600">
									コピーに失敗しました。もう一度お試しください。
								</p>
							) : null}
						</div>,
						document.body,
					)
				: null}

			{canUsePortal && isModalOpen
				? createPortal(
						<div data-no-post-nav="true">
							<Modal
								title="投稿を共有"
								onClose={() => {
									setIsModalOpen(false);
								}}
								panelClassName="max-w-md"
								zIndexClassName="z-[90]"
							>
								<div className="space-y-4 px-4 py-4">
									<OgpPreview
										src={ogImageUrl}
										loadState={ogpPreviewLoadState}
										onLoad={handleOgpPreviewLoad}
										onError={handleOgpPreviewError}
									/>
									<button
										type="button"
										onClick={() => {
											void handleCopyLink();
										}}
										className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
									>
										{copyState === "copied" ? (
											<Check className="h-4 w-4" />
										) : (
											<Copy className="h-4 w-4" />
										)}
										{copyState === "copied"
											? "コピーしました"
											: "リンクをコピー"}
									</button>
									{copyState === "error" ? (
										<p className="text-center text-xs text-rose-600">
											コピーに失敗しました。もう一度お試しください。
										</p>
									) : null}
								</div>
							</Modal>
						</div>,
						document.body,
					)
				: null}
		</div>
	);
}

type OgpPreviewProps = {
	src: string;
	loadState: OgpPreviewLoadState;
	onLoad: () => void;
	onError: () => void;
	className?: string;
};

function OgpPreview({
	src,
	loadState,
	onLoad,
	onError,
	className,
}: OgpPreviewProps) {
	const shouldShowImage = loadState === "loaded";
	const shouldShowSkeleton = loadState === "loading" || loadState === "idle";

	return (
		<div
			className={`overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] ${className ?? ""}`}
		>
			<div className="relative aspect-[1200/630] w-full">
				<img
					src={src}
					alt="投稿のプレビュー"
					onLoad={onLoad}
					onError={onError}
					className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
						shouldShowImage ? "opacity-100" : "opacity-0"
					}`}
				/>
				{shouldShowSkeleton ? (
					<div className="absolute inset-0 animate-pulse bg-zinc-200/70" />
				) : null}
				{loadState === "error" ? (
					<div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-muted)] px-4 text-center text-xs font-medium text-[var(--text-subtle)]">
						投稿プレビューを読み込めませんでした
					</div>
				) : null}
			</div>
		</div>
	);
}

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

const clampValue = (value: number, min: number, max: number) => {
	if (max < min) {
		return min;
	}

	return Math.min(max, Math.max(min, value));
};
