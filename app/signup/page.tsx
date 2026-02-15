"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { signUpWithEmail } from "@/lib/auth-actions";

export default function SignupPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		const result = await signUpWithEmail({
			name,
			email,
			password,
		});

		if (!result.success) {
			setError(result.error ?? "Signup failed");
			setIsLoading(false);
			return;
		}

		router.push("/");
	};

	return (
		<div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
			<div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
				<h1 className="text-2xl font-semibold text-zinc-900">Create account</h1>
				<p className="mt-2 text-sm text-zinc-500">
					Sign up to access the secure API playground.
				</p>
				<form onSubmit={handleSubmit} className="mt-6 space-y-4">
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium text-zinc-700" htmlFor="name">
							Name
						</label>
						<input
							id="name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label
							className="text-sm font-medium text-zinc-700"
							htmlFor="email"
						>
							Email
						</label>
						<input
							id="email"
							type="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label
							className="text-sm font-medium text-zinc-700"
							htmlFor="password"
						>
							Password
						</label>
						<input
							id="password"
							type="password"
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
						/>
					</div>
					<button
						type="submit"
						disabled={isLoading}
						className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
					>
						{isLoading ? "Creating account..." : "Create account"}
					</button>
				</form>
				{error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
				<p className="mt-6 text-sm text-zinc-500">
					Already have an account?{" "}
					<Link href="/login" className="font-medium text-zinc-900">
						Log in
					</Link>
					.
				</p>
			</div>
		</div>
	);
}
