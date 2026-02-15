import type { MouseEvent as ReactMouseEvent } from "react";
import type { LinkSummary } from "@/lib/social-api";

type LinkPreviewCardProps = {
	link: LinkSummary;
};

export function LinkPreviewCard({ link }: LinkPreviewCardProps) {
	const title = link.title ?? link.displayUrl;
	const subtitle = link.siteName ?? link.host;

	const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
		event.stopPropagation();
	};

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
