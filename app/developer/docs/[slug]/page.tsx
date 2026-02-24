import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DEVELOPER_DOC_PAGES, loadDeveloperDocMarkdown } from "../_docs";
import { MARKDOWN_COMPONENTS } from "../_markdown-components";

type DeveloperDocDetailPageProps = {
	params: Promise<{
		slug: string;
	}>;
};

export default async function DeveloperDocDetailPage({
	params,
}: DeveloperDocDetailPageProps) {
	const { slug } = await params;
	const loaded = await loadDeveloperDocMarkdown(slug);
	if (!loaded) {
		notFound();
	}

	return (
		<div className="min-h-screen bg-[#f7f9fb]">
			<header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
				<div className="flex h-12 items-center justify-between px-4 sm:px-6">
					<p className="text-sm font-bold tracking-tight text-slate-900">
						Developer API Docs
					</p>
					<div className="flex items-center gap-2">
						<Link
							href="/developer/docs"
							className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
						>
							Docs一覧
						</Link>
						<Link
							href="/developer"
							className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
						>
							Developer Portalへ戻る
						</Link>
					</div>
				</div>
			</header>

			<main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
				<aside className="rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-16 lg:h-fit">
					<p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
						API Pages
					</p>
					<nav className="mt-2 space-y-1">
						{DEVELOPER_DOC_PAGES.map((docPage) => {
							const isActive = docPage.slug === loaded.docPage.slug;
							return (
								<Link
									key={docPage.slug}
									href={`/developer/docs/${docPage.slug}`}
									className={`block rounded-md px-2.5 py-2 text-sm transition ${
										isActive
											? "bg-sky-50 font-semibold text-sky-900"
											: "text-slate-700 hover:bg-slate-50"
									}`}
								>
									{docPage.title}
								</Link>
							);
						})}
					</nav>
				</aside>

				<section className="rounded-xl border border-slate-200 bg-white p-5">
					<article className="space-y-4">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={MARKDOWN_COMPONENTS}
						>
							{loaded.markdown}
						</ReactMarkdown>
					</article>
				</section>
			</main>
		</div>
	);
}

export const generateStaticParams = async () => {
	return DEVELOPER_DOC_PAGES.map((docPage) => ({
		slug: docPage.slug,
	}));
};
