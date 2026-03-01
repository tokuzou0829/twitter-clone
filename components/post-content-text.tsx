import Link from "next/link";
import type { ReactNode } from "react";

import { extractPostLinks } from "@/lib/post-content";
import type { PostMentionSummary } from "@/lib/social-api";

const HASHTAG_LINK_REGEX = /#[\p{L}\p{N}_]{1,50}/gu;

type RenderPostContentOptions = {
	openLinksInNewTab?: boolean;
};

export function renderPostContent(
	content: string,
	mentions: PostMentionSummary[] = [],
	options: RenderPostContentOptions = {},
) {
	const links = extractPostLinks(content);
	const normalizedMentionRanges = normalizeMentionRanges(
		content,
		mentions,
		links,
	);
	if (links.length === 0 && normalizedMentionRanges.length === 0) {
		return renderHashtagsFromSegment(content, 0, content, options);
	}

	const fragments: ReactNode[] = [];
	let cursor = 0;
	let linkIndex = 0;
	let mentionIndex = 0;

	while (cursor < content.length) {
		while (links[linkIndex] && links[linkIndex].end <= cursor) {
			linkIndex += 1;
		}
		while (
			normalizedMentionRanges[mentionIndex] &&
			normalizedMentionRanges[mentionIndex].end <= cursor
		) {
			mentionIndex += 1;
		}

		const nextLink = links[linkIndex] ?? null;
		const nextMention = normalizedMentionRanges[mentionIndex] ?? null;
		const hasLinkToken = Boolean(nextLink);
		const hasMentionToken = Boolean(nextMention);

		if (!hasLinkToken && !hasMentionToken) {
			fragments.push(
				...renderHashtagsFromSegment(
					content.slice(cursor),
					cursor,
					content,
					options,
				),
			);
			break;
		}

		const shouldRenderLink =
			hasLinkToken &&
			(!hasMentionToken ||
				(nextLink?.start ?? Number.POSITIVE_INFINITY) <=
					(nextMention?.start ?? Number.POSITIVE_INFINITY));
		const tokenStart = shouldRenderLink
			? (nextLink?.start ?? cursor)
			: (nextMention?.start ?? cursor);

		if (cursor < tokenStart) {
			fragments.push(
				...renderHashtagsFromSegment(
					content.slice(cursor, tokenStart),
					cursor,
					content,
					options,
				),
			);
		}

		if (shouldRenderLink && nextLink) {
			const linkText = content.slice(nextLink.start, nextLink.end);
			fragments.push(
				<a
					key={`url-${nextLink.position}-${nextLink.start}`}
					href={nextLink.normalizedUrl}
					target="_blank"
					rel="noopener noreferrer"
					data-no-post-nav="true"
					className="text-sky-600 hover:underline break-all"
				>
					{linkText}
				</a>,
			);
			cursor = nextLink.end;
			linkIndex += 1;
			continue;
		}

		if (nextMention) {
			const mentionText = content.slice(nextMention.start, nextMention.end);
			const mentionRel = options.openLinksInNewTab
				? "noopener noreferrer"
				: undefined;
			fragments.push(
				<Link
					key={`mention-${nextMention.user.id}-${nextMention.start}`}
					href={`/users/${nextMention.user.id}`}
					target={options.openLinksInNewTab ? "_blank" : undefined}
					rel={mentionRel}
					data-no-post-nav="true"
					className="text-sky-600 hover:underline break-all"
				>
					{mentionText}
				</Link>,
			);
			cursor = nextMention.end;
			mentionIndex += 1;
			continue;
		}

		break;
	}

	return fragments.length > 0 ? fragments : content;
}

function normalizeMentionRanges(
	content: string,
	mentions: PostMentionSummary[],
	links: ReturnType<typeof extractPostLinks>,
) {
	const sortedMentions = [...mentions].sort((a, b) => {
		if (a.start !== b.start) {
			return a.start - b.start;
		}

		return a.end - b.end;
	});

	const normalizedMentions: PostMentionSummary[] = [];
	for (const mention of sortedMentions) {
		if (!mention.user?.id) {
			continue;
		}

		if (
			!Number.isInteger(mention.start) ||
			!Number.isInteger(mention.end) ||
			mention.start < 0 ||
			mention.end > content.length ||
			mention.end <= mention.start
		) {
			continue;
		}

		if (
			links.some((link) => mention.start < link.end && mention.end > link.start)
		) {
			continue;
		}

		const lastMention = normalizedMentions[normalizedMentions.length - 1];
		if (lastMention && mention.start < lastMention.end) {
			continue;
		}

		normalizedMentions.push(mention);
	}

	return normalizedMentions;
}

function renderHashtagsFromSegment(
	segment: string,
	segmentOffset: number,
	fullContent: string,
	options: RenderPostContentOptions,
) {
	const fragments: ReactNode[] = [];
	let cursor = 0;
	let hashtagIndex = 0;

	for (const match of segment.matchAll(HASHTAG_LINK_REGEX)) {
		const matchedTag = match[0];
		const startIndex = match.index;
		if (!matchedTag || startIndex === undefined) {
			continue;
		}

		const globalStartIndex = segmentOffset + startIndex;
		const previousChar =
			globalStartIndex === 0 ? "" : fullContent[globalStartIndex - 1];
		if (globalStartIndex !== 0 && !/\s/u.test(previousChar)) {
			continue;
		}

		if (cursor < startIndex) {
			fragments.push(segment.slice(cursor, startIndex));
		}

		const normalizedTag = `#${matchedTag.slice(1).toLowerCase()}`;
		const hashtagRel = options.openLinksInNewTab
			? "noopener noreferrer"
			: undefined;
		fragments.push(
			<Link
				key={`hashtag-${segmentOffset}-${hashtagIndex}`}
				href={`/search?q=${encodeURIComponent(normalizedTag)}`}
				target={options.openLinksInNewTab ? "_blank" : undefined}
				rel={hashtagRel}
				data-no-post-nav="true"
				className="text-sky-600 hover:underline break-all"
			>
				{matchedTag}
			</Link>,
		);

		cursor = startIndex + matchedTag.length;
		hashtagIndex += 1;
	}

	if (cursor < segment.length) {
		fragments.push(segment.slice(cursor));
	}

	return fragments;
}
