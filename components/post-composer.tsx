"use client";

import { type FormEvent, useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";
import {
	countPostContentLength,
	MAX_POST_CONTENT_LENGTH,
} from "@/lib/post-content";
import { createDisplayHandle } from "@/lib/user-handle";

type PostComposerProps = {
	title: string;
	placeholder: string;
	submitLabel: string;
	onSubmit: (formData: FormData) => Promise<void>;
	onCancel?: () => void;
	variant?: "home" | "inline";
};

const MAX_FILES = 4;

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

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setIsLoading(true);

		const formData = new FormData();
		formData.set("content", content);
		for (const image of images) {
			formData.append("images", image);
		}

		try {
			await onSubmit(formData);
			setContent("");
			setImages([]);
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

	return (
		<form
			onSubmit={handleSubmit}
			className={frameClassName}
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

					<textarea
						value={content}
						onChange={(event) => setContent(event.target.value)}
						rows={variant === "home" ? 4 : 3}
						placeholder={placeholder}
						className={`w-full resize-none rounded-2xl border px-4 py-3 text-base text-[var(--text-main)] outline-none transition ${
							variant === "home"
								? "border-transparent bg-transparent px-0 text-xl placeholder:text-zinc-500"
								: "border-[var(--border-subtle)] bg-white placeholder:text-zinc-400 focus:border-sky-400"
						}`}
					/>

					{images.length > 0 ? (
						<div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-subtle)]">
							{images.map((image) => (
								<span
									key={`${image.name}-${image.size}-${image.lastModified}`}
									className="rounded-full bg-[var(--surface-muted)] px-2 py-1"
								>
									{image.name}
								</span>
							))}
						</div>
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
										const selected = Array.from(
											event.currentTarget.files ?? [],
										);
										setImages((current) => {
											const merged = [...current, ...selected];
											const unique = merged.filter((file, index, files) => {
												return (
													files.findIndex(
														(candidate) =>
															candidate.name === file.name &&
															candidate.size === file.size &&
															candidate.lastModified === file.lastModified,
													) === index
												);
											});

											return unique.slice(0, MAX_FILES);
										});
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
