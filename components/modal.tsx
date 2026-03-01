"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";

type ModalProps = {
	children: ReactNode;
	onClose: () => void;
	title?: string;
	panelClassName?: string;
	zIndexClassName?: string;
};

export function Modal({
	children,
	onClose,
	title,
	panelClassName,
	zIndexClassName,
}: ModalProps) {
	const headingId = useId();

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			document.body.style.overflow = originalOverflow;
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	return (
		<div
			className={`fixed inset-0 ${zIndexClassName ?? "z-50"} flex items-end justify-center bg-black/45 sm:items-center sm:p-4`}
		>
			<button
				type="button"
				onClick={onClose}
				className="absolute inset-0"
				aria-label="Close modal"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? headingId : undefined}
				aria-label={title ? undefined : "Modal"}
				className={`relative z-10 w-full overflow-hidden rounded-t-3xl bg-[var(--surface-main)] shadow-[0_24px_80px_rgba(15,20,25,0.35)] sm:rounded-3xl ${panelClassName ?? "max-w-2xl"}`}
			>
				<div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
					{title ? (
						<h2
							id={headingId}
							className="text-lg font-extrabold text-[var(--text-main)]"
						>
							{title}
						</h2>
					) : (
						<div />
					)}
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
						aria-label="Close modal"
					>
						<X className="h-5 w-5" />
					</button>
				</div>
				<div className="max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)]">
					{children}
				</div>
			</div>
		</div>
	);
}
