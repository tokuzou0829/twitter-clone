"use client";

import {
	type ChangeEvent,
	type ClipboardEvent,
	type DragEvent,
	type FormEvent,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useChatSubmit } from "use-chat-submit";

import { LinkPreviewCard } from "@/components/link-preview-card";
import { authClient } from "@/lib/auth-client";
import {
	countPostContentLength,
	extractUniquePostLinks,
	MAX_POST_CONTENT_LENGTH,
} from "@/lib/post-content";
import {
	fetchMentionSuggestions,
	type LinkSummary,
	resolveLinkPreview,
	type UserSummary,
} from "@/lib/social-api";
import { createDisplayHandle, MAX_HANDLE_LENGTH } from "@/lib/user-handle";

type PostComposerProps = {
	title: string;
	placeholder: string;
	submitLabel: string;
	onSubmit: (formData: FormData) => Promise<void>;
	onCancel?: () => void;
	variant?: "home" | "inline";
};

const MAX_FILES = 4;
const MENTION_SUGGEST_DEBOUNCE_MS = 120;
const LINK_PREVIEW_DEBOUNCE_MS = 300;

type MentionQueryRange = {
	start: number;
	end: number;
	query: string;
};

export function PostComposer({
	title,
	placeholder,
	submitLabel,
	onSubmit,
	onCancel,
	variant = "home",
}: PostComposerProps) {
	const { data: session } = authClient.useSession();
	const [content, setContent] = useState("");
	const [images, setImages] = useState<File[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const dragDepthRef = useRef(0);
	const [isDraggingImages, setIsDraggingImages] = useState(false);
	const [activeMentionQuery, setActiveMentionQuery] =
		useState<MentionQueryRange | null>(null);
	const [mentionSuggestions, setMentionSuggestions] = useState<UserSummary[]>(
		[],
	);
	const [activeMentionIndex, setActiveMentionIndex] = useState(0);
	const [isMentionLoading, setIsMentionLoading] = useState(false);
	const [previewLink, setPreviewLink] = useState<LinkSummary | null>(null);
	const [previewLinkError, setPreviewLinkError] = useState<string | null>(null);
	const [isLinkPreviewLoading, setIsLinkPreviewLoading] = useState(false);

	const frameClassName = useMemo(() => {
		return variant === "home"
			? "border-b border-[var(--border-subtle)] px-4 py-3"
			: "rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3";
	}, [variant]);

	const countedLength = countPostContentLength(content);
	const isOverLength = countedLength > MAX_POST_CONTENT_LENGTH;
	const isSubmitDisabled =
		isLoading ||
		isOverLength ||
		(content.trim().length === 0 && images.length === 0);

	const accountHandle = session?.user
		? createDisplayHandle({
				handle: session.user.handle,
				name: session.user.name,
				userId: session.user.id,
			})
		: null;
	const shouldShowMentionSuggestions =
		activeMentionQuery !== null &&
		(isMentionLoading || mentionSuggestions.length > 0);
	const firstLinkForPreview = useMemo(() => {
		return extractUniquePostLinks(content)[0]?.normalizedUrl ?? null;
	}, [content]);
	const imagePreviewUrls = useMemo(() => {
		return images.map((image) => URL.createObjectURL(image));
	}, [images]);

	useEffect(() => {
		return () => {
			for (const url of imagePreviewUrls) {
				URL.revokeObjectURL(url);
			}
		};
	}, [imagePreviewUrls]);

	useEffect(() => {
		if (!firstLinkForPreview) {
			setPreviewLink(null);
			setPreviewLinkError(null);
			setIsLinkPreviewLoading(false);
			return;
		}

		let ignore = false;
		setIsLinkPreviewLoading(true);
		setPreviewLinkError(null);

		const timer = window.setTimeout(() => {
			void resolveLinkPreview(firstLinkForPreview)
				.then((link) => {
					if (ignore) {
						return;
					}

					setPreviewLink(link);
				})
				.catch(() => {
					if (ignore) {
						return;
					}

					setPreviewLink(null);
					setPreviewLinkError("リンクプレビューを取得できませんでした");
				})
				.finally(() => {
					if (!ignore) {
						setIsLinkPreviewLoading(false);
					}
				});
		}, LINK_PREVIEW_DEBOUNCE_MS);

		return () => {
			ignore = true;
			window.clearTimeout(timer);
		};
	}, [firstLinkForPreview]);

	const appendImages = (nextFiles: File[]) => {
		if (nextFiles.length === 0) {
			return;
		}

		setImages((current) => mergeComposerImages(current, nextFiles));
	};

	const removeImageAt = (targetIndex: number) => {
		setImages((current) => {
			return current.filter((_, index) => index !== targetIndex);
		});
	};

	const updateMentionQueryFromSelection = (
		nextContent: string,
		selectionStart: number | null,
	) => {
		const nextRange =
			typeof selectionStart === "number"
				? findMentionQueryRange(nextContent, selectionStart)
				: null;
		setActiveMentionQuery(nextRange);

		if (!nextRange) {
			setMentionSuggestions([]);
			setActiveMentionIndex(0);
		}
	};

	const insertMentionSuggestion = (user: UserSummary) => {
		if (!activeMentionQuery || !user.handle) {
			return;
		}

		const beforeMention = content.slice(0, activeMentionQuery.start);
		const afterMention = content.slice(activeMentionQuery.end);
		const suffix =
			afterMention.length === 0 ||
			afterMention.startsWith(" ") ||
			afterMention.startsWith("\n")
				? ""
				: " ";
		const mentionText = `@${user.handle}${suffix}`;
		const nextContent = `${beforeMention}${mentionText}${afterMention}`;
		const nextCursor = beforeMention.length + mentionText.length;

		setContent(nextContent);
		setActiveMentionQuery(null);
		setMentionSuggestions([]);
		setActiveMentionIndex(0);

		requestAnimationFrame(() => {
			if (!textareaRef.current) {
				return;
			}

			textareaRef.current.focus();
			textareaRef.current.setSelectionRange(nextCursor, nextCursor);
		});
	};

	useEffect(() => {
		if (!session?.user?.id || !activeMentionQuery) {
			setIsMentionLoading(false);
			return;
		}

		let ignore = false;
		setIsMentionLoading(true);

		const timer = window.setTimeout(() => {
			void fetchMentionSuggestions(activeMentionQuery.query)
				.then((users) => {
					if (ignore) {
						return;
					}

					setMentionSuggestions(users);
					setActiveMentionIndex(0);
				})
				.catch(() => {
					if (ignore) {
						return;
					}

					setMentionSuggestions([]);
				})
				.finally(() => {
					if (!ignore) {
						setIsMentionLoading(false);
					}
				});
		}, MENTION_SUGGEST_DEBOUNCE_MS);

		return () => {
			ignore = true;
			window.clearTimeout(timer);
		};
	}, [activeMentionQuery, session?.user?.id]);

	const handleMentionKeyDownCapture = (
		event: KeyboardEvent<HTMLTextAreaElement>,
	) => {
		if (!activeMentionQuery || mentionSuggestions.length === 0) {
			return;
		}

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveMentionIndex((current) => {
				return current + 1 >= mentionSuggestions.length ? 0 : current + 1;
			});
			return;
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveMentionIndex((current) => {
				return current - 1 < 0 ? mentionSuggestions.length - 1 : current - 1;
			});
			return;
		}

		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault();
			insertMentionSuggestion(mentionSuggestions[activeMentionIndex]);
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			setActiveMentionQuery(null);
			setMentionSuggestions([]);
			setActiveMentionIndex(0);
		}
	};

	const submitPost = async (nextContent = content) => {
		const nextCountedLength = countPostContentLength(nextContent);
		const isNextOverLength = nextCountedLength > MAX_POST_CONTENT_LENGTH;
		const isNextSubmitDisabled =
			isLoading ||
			isNextOverLength ||
			(nextContent.trim().length === 0 && images.length === 0);

		if (isNextSubmitDisabled) {
			return;
		}

		setError(null);
		setIsLoading(true);

		const formData = new FormData();
		formData.set("content", nextContent);
		for (const image of images) {
			formData.append("images", image);
		}

		try {
			await onSubmit(formData);
			setContent("");
			setImages([]);
			setPreviewLink(null);
			setPreviewLinkError(null);
			setIsLinkPreviewLoading(false);
			setActiveMentionQuery(null);
			setMentionSuggestions([]);
			setActiveMentionIndex(0);
		} catch (submitError) {
			if (submitError instanceof Error) {
				setError(submitError.message);
			} else {
				setError("Failed to submit post");
			}
		} finally {
			setIsLoading(false);
		}
	};

	const { getTextareaProps } = useChatSubmit({
		mode: "mod-enter",
		allowEmptySubmit: true,
		onSubmit: (nextContent) => {
			void submitPost(nextContent);
		},
	});

	const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void submitPost();
	};

	const handleContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		const nextValue = event.target.value;
		setContent(nextValue);
		updateMentionQueryFromSelection(nextValue, event.target.selectionStart);
	};

	const handleTextareaSelect = () => {
		if (!textareaRef.current) {
			return;
		}

		updateMentionQueryFromSelection(
			textareaRef.current.value,
			textareaRef.current.selectionStart,
		);
	};

	const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
		const imageFiles = extractImageFilesFromDataTransfer(event.clipboardData);
		if (imageFiles.length === 0) {
			return;
		}

		event.preventDefault();
		appendImages(imageFiles);
	};

	const handleFormDragEnter = (event: DragEvent<HTMLFormElement>) => {
		if (!hasImageFilesInTransfer(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		dragDepthRef.current += 1;
		setIsDraggingImages(true);
	};

	const handleFormDragOver = (event: DragEvent<HTMLFormElement>) => {
		if (!hasImageFilesInTransfer(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setIsDraggingImages(true);
	};

	const handleFormDragLeave = (event: DragEvent<HTMLFormElement>) => {
		if (!hasImageFilesInTransfer(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) {
			setIsDraggingImages(false);
		}
	};

	const handleFormDrop = (event: DragEvent<HTMLFormElement>) => {
		dragDepthRef.current = 0;
		setIsDraggingImages(false);

		const imageFiles = extractImageFilesFromDataTransfer(event.dataTransfer);
		if (imageFiles.length === 0) {
			return;
		}

		event.preventDefault();
		appendImages(imageFiles);
	};

	return (
		<form
			onSubmit={handleFormSubmit}
			onDragEnter={handleFormDragEnter}
			onDragOver={handleFormDragOver}
			onDragLeave={handleFormDragLeave}
			onDrop={handleFormDrop}
			className={`${frameClassName} ${
				isDraggingImages ? "bg-sky-50/80 ring-2 ring-sky-200 ring-inset" : ""
			}`}
			id={variant === "home" ? "composer" : undefined}
		>
			<div className="flex items-start gap-3">
				{variant === "home" ? (
					<div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-700">
						{session?.user?.image ? (
							<img
								src={session.user.image}
								alt={session.user.name ?? "Avatar"}
								className="h-full w-full object-cover"
							/>
						) : (
							(session?.user?.name?.slice(0, 2).toUpperCase() ?? "U")
						)}
					</div>
				) : null}

				<div className="min-w-0 flex-1">
					{title ? (
						<p className="text-sm font-bold text-[var(--text-main)]">{title}</p>
					) : null}
					{variant === "home" && accountHandle ? (
						<p className="mb-2 text-xs text-[var(--text-subtle)]">
							{accountHandle}
						</p>
					) : null}

					<div className="relative">
						<textarea
							{...getTextareaProps({
								value: content,
								onChange: handleContentChange,
								onSelect: handleTextareaSelect,
								onClick: handleTextareaSelect,
								onBlur: () => {
									setActiveMentionQuery(null);
									setMentionSuggestions([]);
									setActiveMentionIndex(0);
								},
								onKeyDownCapture: handleMentionKeyDownCapture,
								onPaste: handleTextareaPaste,
								rows: variant === "home" ? 4 : 3,
								placeholder,
								ref: (element) => {
									textareaRef.current = element;
								},
								className: `w-full resize-none rounded-2xl border px-4 py-3 text-base text-[var(--text-main)] outline-none transition ${
									variant === "home"
										? "border-transparent bg-transparent px-0 text-xl placeholder:text-zinc-500"
										: "border-[var(--border-subtle)] bg-white placeholder:text-zinc-400 focus:border-sky-400"
								}`,
							})}
						/>

						{shouldShowMentionSuggestions ? (
							<div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white shadow-[0_10px_28px_rgba(15,20,25,0.12)]">
								{isMentionLoading ? (
									<p className="px-3 py-2 text-xs text-[var(--text-subtle)]">
										候補を読み込み中...
									</p>
								) : (
									<ul>
										{mentionSuggestions.map((suggestion, index) => {
											const isActive = index === activeMentionIndex;
											const displayHandle = createDisplayHandle({
												handle: suggestion.handle,
												name: suggestion.name,
												userId: suggestion.id,
											});

											return (
												<li key={suggestion.id}>
													<button
														type="button"
														onMouseDown={(event) => {
															event.preventDefault();
														}}
														onClick={() => insertMentionSuggestion(suggestion)}
														className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
															isActive ? "bg-sky-50" : "hover:bg-zinc-50"
														}`}
													>
														<div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-500">
															{suggestion.image ? (
																<img
																	src={suggestion.image}
																	alt={suggestion.name}
																	className="h-full w-full object-cover"
																/>
															) : (
																suggestion.name.slice(0, 2).toUpperCase()
															)}
														</div>
														<div className="min-w-0 flex-1">
															<p className="truncate text-sm font-semibold text-[var(--text-main)]">
																{suggestion.name}
															</p>
															<p className="truncate text-xs text-[var(--text-subtle)]">
																{displayHandle}
															</p>
														</div>
													</button>
												</li>
											);
										})}
									</ul>
								)}
							</div>
						) : null}
					</div>

					{isDraggingImages ? (
						<p className="mt-2 text-xs font-semibold text-sky-700">
							画像をドロップして追加
						</p>
					) : null}

					{images.length > 0 ? (
						<div className="mt-2 flex flex-wrap gap-2">
							{images.map((image, index) => {
								const previewUrl = imagePreviewUrls[index];

								return (
									<div
										key={`${image.name}-${image.size}-${image.lastModified}`}
										className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]"
									>
										{previewUrl ? (
											<img
												src={previewUrl}
												alt={image.name}
												className="h-24 w-24 object-cover"
											/>
										) : null}
										<button
											type="button"
											onClick={() => removeImageAt(index)}
											className="absolute right-1 top-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white transition hover:bg-black/80"
										>
											削除
										</button>
									</div>
								);
							})}
						</div>
					) : null}

					{isLinkPreviewLoading ? (
						<p className="mt-3 text-xs text-[var(--text-subtle)]">
							リンクプレビューを取得中...
						</p>
					) : null}
					{previewLink ? (
						<div className="mt-3">
							<LinkPreviewCard link={previewLink} />
						</div>
					) : null}
					{previewLinkError && firstLinkForPreview ? (
						<p className="mt-3 text-xs text-rose-600">{previewLinkError}</p>
					) : null}

					<div
						className={`mt-3 flex flex-wrap items-center justify-between gap-3 ${
							variant === "home"
								? "border-t border-[var(--border-subtle)] pt-3"
								: ""
						}`}
					>
						<div className="flex items-center gap-2">
							<label className="inline-flex cursor-pointer items-center rounded-full px-3 py-1.5 text-xs font-bold text-sky-600 transition hover:bg-sky-50">
								画像を追加
								<input
									type="file"
									accept="image/*"
									multiple
									className="hidden"
									onChange={(event) => {
										appendImages(
											extractImageFilesFromDataTransfer(event.currentTarget),
										);
										event.currentTarget.value = "";
									}}
								/>
							</label>
							{images.length > 0 ? (
								<button
									type="button"
									onClick={() => setImages([])}
									className="rounded-full px-3 py-1.5 text-xs font-bold text-[var(--text-subtle)] transition hover:bg-[var(--surface-muted)]"
								>
									Clear
								</button>
							) : null}
						</div>

						<div className="flex items-center gap-2">
							<span
								className={`text-xs ${
									isOverLength ? "text-rose-600" : "text-[var(--text-subtle)]"
								}`}
							>
								{countedLength}/{MAX_POST_CONTENT_LENGTH}
							</span>
							<button
								type="submit"
								disabled={isSubmitDisabled}
								className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isLoading ? "Sending..." : submitLabel}
							</button>
							{onCancel ? (
								<button
									type="button"
									onClick={onCancel}
									className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--surface-muted)]"
								>
									キャンセル
								</button>
							) : null}
						</div>
					</div>

					{error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
				</div>
			</div>
		</form>
	);
}

const HANDLE_TOKEN_CHARACTER_REGEX = /[a-z0-9_]/iu;
const HANDLE_QUERY_CHARACTER_REGEX = /^[a-z0-9_]*$/iu;

type FileTransferSource = {
	files: FileList | null;
	items?: DataTransferItemList | null;
};

const findMentionQueryRange = (
	value: string,
	caretPosition: number,
): MentionQueryRange | null => {
	if (caretPosition < 0 || caretPosition > value.length) {
		return null;
	}

	const mentionStart = value.lastIndexOf("@", caretPosition - 1);
	if (mentionStart < 0) {
		return null;
	}

	const previousCharacter = mentionStart > 0 ? value[mentionStart - 1] : "";
	if (
		previousCharacter &&
		HANDLE_TOKEN_CHARACTER_REGEX.test(previousCharacter)
	) {
		return null;
	}

	const query = value.slice(mentionStart + 1, caretPosition);
	if (!HANDLE_QUERY_CHARACTER_REGEX.test(query)) {
		return null;
	}

	if (query.length > MAX_HANDLE_LENGTH) {
		return null;
	}

	return {
		start: mentionStart,
		end: caretPosition,
		query: query.toLowerCase(),
	};
};

const extractImageFilesFromDataTransfer = (
	source: FileTransferSource,
): File[] => {
	const filesFromFileList = Array.from(source.files ?? []).filter(isImageFile);
	if (filesFromFileList.length > 0) {
		return dedupeImageFiles(filesFromFileList);
	}

	const filesFromItems = source.items
		? Array.from(source.items)
				.map((item) => item.getAsFile())
				.filter((file): file is File => file !== null)
				.filter(isImageFile)
		: [];

	return dedupeImageFiles(filesFromItems);
};

const hasImageFilesInTransfer = (transfer: DataTransfer | null) => {
	if (!transfer) {
		return false;
	}

	if (!Array.from(transfer.types).includes("Files")) {
		return false;
	}

	return extractImageFilesFromDataTransfer(transfer).length > 0;
};

const mergeComposerImages = (current: File[], next: File[]) => {
	return dedupeImageFiles([...current, ...next]).slice(0, MAX_FILES);
};

const dedupeImageFiles = (files: File[]) => {
	return files.filter((file, index, allFiles) => {
		return (
			allFiles.findIndex((candidate) => {
				return (
					candidate.name === file.name &&
					candidate.size === file.size &&
					candidate.lastModified === file.lastModified
				);
			}) === index
		);
	});
};

const isImageFile = (file: File) => {
	return file.size > 0 && file.type.startsWith("image/");
};
