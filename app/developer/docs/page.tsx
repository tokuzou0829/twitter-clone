import Link from "next/link";
import { DEVELOPER_DOC_PAGES } from "./_docs";

export default function DeveloperDocsPage() {
	const groupedPages = groupDocPagesByCategory(DEVELOPER_DOC_PAGES);

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

			<main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
				<section className="rounded-xl border border-slate-200 bg-white p-5">
					<p className="text-sm text-slate-600">
						APIドキュメントへようこそ！ここからあなたのためのBOTの作成を始めましょう！
					</p>

					<div className="mt-5 space-y-6">
						{groupedPages.map((group) => (
							<section key={group.category}>
								<h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
									{group.category}
								</h2>
								<div className="mt-3 grid gap-3 sm:grid-cols-2">
									{group.pages.map((page) => (
										<Link
											key={page.slug}
											href={`/developer/docs/${page.slug}`}
											className="group rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50"
										>
											<p className="text-sm font-semibold text-slate-900 group-hover:text-sky-900">
												{page.title}
											</p>
											<p className="mt-1 text-xs text-slate-600 group-hover:text-sky-800">
												{page.description}
											</p>
										</Link>
									))}
								</div>
							</section>
						))}
					</div>
				</section>
			</main>
		</div>
	);
}

const groupDocPagesByCategory = (
	pages: typeof DEVELOPER_DOC_PAGES,
): Array<{
	category: string;
	pages: typeof DEVELOPER_DOC_PAGES;
}> => {
	const groups = new Map<string, typeof pages>();

	for (const page of pages) {
		const list = groups.get(page.category) ?? [];
		list.push(page);
		groups.set(page.category, list);
	}

	return [...groups.entries()].map(([category, categoryPages]) => ({
		category,
		pages: categoryPages,
	}));
};
