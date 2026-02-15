import Link from "next/link";

import { MePanel } from "@/components/me-panel";
import { PushTestCard } from "@/components/push-test-card";
import { SecureMessageForm } from "@/components/secure-message-form";

export default function Home() {
	return (
		<div className="space-y-10">
			<section className="space-y-4">
				<p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
					Hono RPC + Better Auth
				</p>
				<h1 className="text-3xl font-semibold text-zinc-900">
					Secure API playground for Next.js
				</h1>
				<p className="max-w-2xl text-base text-zinc-600">
					This demo uses Hono for typed APIs, Better Auth for email/password
					authentication, and Drizzle ORM with PostgreSQL to persist sessions.
				</p>
				<div className="flex flex-wrap gap-3 text-sm">
					<Link
						href="/login"
						className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300"
					>
						Go to login
					</Link>
					<Link
						href="/signup"
						className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
					>
						Create account
					</Link>
				</div>
			</section>

			<section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
					<h2 className="text-lg font-semibold text-zinc-900">
						Quick checklist
					</h2>
					<ol className="mt-3 space-y-2 text-sm text-zinc-600">
						<li>1. Create an account on the signup page.</li>
						<li>2. Log in to create a session cookie.</li>
						<li>3. Call the secure API using the form below.</li>
					</ol>
					<p className="mt-4 text-xs text-zinc-400">
						Your session is validated via Hono middleware + Better Auth.
					</p>
				</div>
				<MePanel />
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<SecureMessageForm />
				<PushTestCard />
			</section>
		</div>
	);
}
