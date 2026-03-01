import type { CSSProperties, ReactNode } from "react";

import {
	createEmbedThemeVariables,
	type EmbedStyleOptions,
	isEmbedBorderEnabled,
} from "@/lib/embed";

type EmbedShellProps = {
	styleOptions: EmbedStyleOptions;
	heading?: string;
	subheading?: string;
	children: ReactNode;
};

export function EmbedShell({
	styleOptions,
	heading,
	subheading,
	children,
}: EmbedShellProps) {
	const variables = {
		...createEmbedThemeVariables(styleOptions.theme),
		"--embed-radius": `${styleOptions.radius}px`,
	} as CSSProperties;

	const dividerClassName = isEmbedBorderEnabled(styleOptions)
		? "border-[var(--embed-border)]"
		: "border-[var(--embed-surface-muted)]";
	const mainClassName = styleOptions.chrome.transparent
		? "w-full p-0 text-[var(--embed-text-main)]"
		: "w-full bg-[var(--embed-bg)] p-0 text-[var(--embed-text-main)]";
	const surfaceClassName = styleOptions.chrome.transparent
		? "bg-transparent"
		: "bg-[var(--embed-surface)]";
	const alignClassName =
		styleOptions.align === "left"
			? "mr-auto ml-0"
			: styleOptions.align === "right"
				? "ml-auto mr-0"
				: "mx-auto";
	const shouldShowHeader = Boolean(heading) && !styleOptions.chrome.noheader;
	const scrollingClassName = styleOptions.chrome.noscrollbar
		? "overflow-hidden"
		: "";

	return (
		<main
			style={variables}
			className={`${mainClassName} ${scrollingClassName}`}
		>
			<div
				className={`w-full ${alignClassName}`}
				style={{ maxWidth: `${styleOptions.width}px` }}
			>
				{shouldShowHeader ? (
					<section
						className={`${surfaceClassName} border-b ${dividerClassName} px-4 py-2.5`}
					>
						<p className="text-sm font-semibold text-[var(--embed-text-main)]">
							{heading}
						</p>
						{subheading ? (
							<p className="mt-1 text-xs text-[var(--embed-text-subtle)]">
								{subheading}
							</p>
						) : null}
					</section>
				) : null}
				{children}
			</div>
		</main>
	);
}
