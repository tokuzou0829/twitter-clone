import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DOC_FILE_PATH = path.join(process.cwd(), "docs", "developer-api.md");

export default async function DeveloperDocsPage() {
	const markdown = await loadDeveloperApiMarkdown();

	return (
		<div className="min-h-screen bg-[#f7f9fb]">
			<header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
				<div className="flex h-12 items-center justify-between px-4 sm:px-6">
					<p className="text-sm font-bold tracking-tight text-slate-900">
						Developer API Docs
					</p>
					<Link
						href="/developer"
						className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						Developer Portalへ戻る
					</Link>
				</div>
			</header>

			<main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
				<section className="rounded-xl border border-slate-200 bg-white p-5">
					<article className="space-y-4">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={MARKDOWN_COMPONENTS}
						>
							{markdown}
						</ReactMarkdown>
					</article>
				</section>
			</main>
		</div>
	);
}

const MARKDOWN_COMPONENTS: Components = {
	h1: ({ children }) => (
		<h1 className="text-3xl font-bold tracking-tight text-slate-950">
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2 className="mt-7 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className="mt-5 text-lg font-semibold text-slate-900">{children}</h3>
	),
	p: ({ children }) => <p className="leading-7 text-slate-800">{children}</p>,
	ul: ({ children }) => (
		<ul className="list-disc space-y-1 pl-6">{children}</ul>
	),
	ol: ({ children }) => (
		<ol className="list-decimal space-y-1 pl-6">{children}</ol>
	),
	li: ({ children }) => (
		<li className="leading-7 text-slate-800">{children}</li>
	),
	a: ({ href, children }) => (
		<a
			href={href}
			className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800"
			target={href?.startsWith("http") ? "_blank" : undefined}
			rel={href?.startsWith("http") ? "noreferrer" : undefined}
		>
			{children}
		</a>
	),
	blockquote: ({ children }) => (
		<blockquote className="border-l-4 border-slate-300 bg-slate-50 px-4 py-2 text-slate-700">
			{children}
		</blockquote>
	),
	code: ({ className, children, ...props }) => {
		const isInline = !className && !String(children).includes("\n");
		if (isInline) {
			return (
				<code
					className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.95em] text-slate-900"
					{...props}
				>
					{children}
				</code>
			);
		}

		return (
			<code className={`font-mono text-sm ${className}`} {...props}>
				{children}
			</code>
		);
	},
	pre: ({ children }) => (
		<pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
			{children}
		</pre>
	),
	table: ({ children }) => (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse border border-slate-200 text-sm">
				{children}
			</table>
		</div>
	),
	th: ({ children }) => (
		<th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-900">
			{children}
		</th>
	),
	td: ({ children }) => (
		<td className="border border-slate-200 px-3 py-2 text-slate-800">
			{children}
		</td>
	),
	hr: () => <hr className="my-6 border-slate-200" />,
};

const loadDeveloperApiMarkdown = async () => {
	try {
		return await readFile(DOC_FILE_PATH, "utf-8");
	} catch {
		return [
			"# Developer API",
			"",
			"ドキュメントの読み込みに失敗しました。",
		].join("\n");
	}
};
