import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { PostMentionSummary } from "@/lib/social-api";

const HASHTAG_LINK_REGEX = /(^|\s)(#[\p{L}\p{N}_]{1,50})/gu;
const NON_LINKIFY_SEGMENT_REGEX = /```[\s\S]*?```|`[^`\n]*`/g;

type PostContentProps = {
	content: string;
	mentions?: PostMentionSummary[];
	className?: string;
};

export function PostContent({
	content,
	mentions = [],
	className,
}: PostContentProps) {
	const markdownSource = buildMarkdownSource(content, mentions);

	return (
		<div className={className}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					a: ({ href, children }) => {
						if (typeof href === "string" && href.startsWith("/")) {
							return (
								<Link
									href={href}
									className="text-sky-600 hover:underline break-all"
								>
									{children}
								</Link>
							);
						}

						return (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sky-600 hover:underline break-all"
							>
								{children}
							</a>
						);
					},
					p: ({ children }) => (
						<p className="whitespace-pre-wrap">{children}</p>
					),
					pre: ({ children }) => (
						<pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-950/95 p-3 text-sm text-zinc-100">
							{children}
						</pre>
					),
					code: ({ inline, className: codeClassName, children }) => {
						if (inline) {
							return (
								<code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em] text-zinc-800">
									{children}
								</code>
							);
						}

						const language = codeClassName?.replace("language-", "") ?? "";
						const extraLabel =
							language === "mermaid" || language === "tex"
								? ` (${language})`
								: "";

						return (
							<code className={codeClassName}>
								{children}
								{extraLabel ? (
									<span className="sr-only">{extraLabel}</span>
								) : null}
							</code>
						);
					},
					ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
					ol: ({ children }) => (
						<ol className="list-decimal pl-5">{children}</ol>
					),
					blockquote: ({ children }) => (
						<blockquote className="border-l-2 border-zinc-300 pl-3 text-[var(--text-subtle)]">
							{children}
						</blockquote>
					),
				}}
			>
				{markdownSource}
			</ReactMarkdown>
		</div>
	);
}

const buildMarkdownSource = (
	content: string,
	mentions: PostMentionSummary[],
) => {
	const mentionRanges = normalizeMentionRanges(content, mentions);
	const nonLinkifySegments = [
		...content.matchAll(NON_LINKIFY_SEGMENT_REGEX),
	].map((match) => ({
		start: match.index ?? 0,
		end: (match.index ?? 0) + match[0].length,
	}));

	const parts: string[] = [];
	let cursor = 0;
	let mentionIndex = 0;

	while (cursor < content.length) {
		const segment = nonLinkifySegments.find((item) => item.start === cursor);
		if (segment) {
			parts.push(content.slice(segment.start, segment.end));
			cursor = segment.end;
			continue;
		}

		const nextSegment = nonLinkifySegments.find((item) => item.start > cursor);
		const chunkEnd = nextSegment?.start ?? content.length;
		const chunk = content.slice(cursor, chunkEnd);

		parts.push(
			replaceMentionsAndHashtags(
				chunk,
				cursor,
				mentionRanges,
				() => mentionIndex,
				(value) => {
					mentionIndex = value;
				},
			),
		);
		cursor = chunkEnd;
	}

	return parts.join("");
};

const replaceMentionsAndHashtags = (
	segment: string,
	segmentOffset: number,
	mentions: PostMentionSummary[],
	getMentionIndex: () => number,
	setMentionIndex: (value: number) => void,
) => {
	let output = "";
	let localCursor = 0;
	let mentionIndex = getMentionIndex();

	while (localCursor < segment.length) {
		while (
			mentions[mentionIndex] &&
			mentions[mentionIndex].end <= segmentOffset + localCursor
		) {
			mentionIndex += 1;
		}

		const mention = mentions[mentionIndex];
		const mentionStart = mention
			? mention.start - segmentOffset
			: Number.POSITIVE_INFINITY;

		if (!mention || mentionStart >= segment.length) {
			output += linkifyHashtags(segment.slice(localCursor));
			break;
		}

		if (mentionStart > localCursor) {
			output += linkifyHashtags(segment.slice(localCursor, mentionStart));
		}

		const mentionText = segment.slice(
			mentionStart,
			mention.end - segmentOffset,
		);
		const mentionHref = `/users/${encodeURIComponent(mention.user.id)}`;
		output += `[${mentionText}](${mentionHref})`;
		localCursor = mention.end - segmentOffset;
		mentionIndex += 1;
	}

	setMentionIndex(mentionIndex);
	return output;
};

const linkifyHashtags = (text: string) => {
	return text.replace(HASHTAG_LINK_REGEX, (_, prefix: string, tag: string) => {
		const normalizedTag = `#${tag.slice(1).toLowerCase()}`;
		return `${prefix}[${tag}](/search?q=${encodeURIComponent(normalizedTag)})`;
	});
};

const normalizeMentionRanges = (
	content: string,
	mentions: PostMentionSummary[],
) => {
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

		const lastMention = normalizedMentions[normalizedMentions.length - 1];
		if (lastMention && mention.start < lastMention.end) {
			continue;
		}

		normalizedMentions.push(mention);
	}

	return normalizedMentions;
};
