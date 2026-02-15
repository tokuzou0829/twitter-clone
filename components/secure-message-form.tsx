"use client";

import { type FormEvent, useState } from "react";

import { apiClient } from "@/lib/api-client";

export function SecureMessageForm() {
	const [message, setMessage] = useState("");
	const [response, setResponse] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setResponse(null);
		setError(null);

		const result = await apiClient.api.auth["secure-message"].$post({
			json: {
				message,
			},
		});

		if (!result.ok) {
			const body = (await result.json().catch(() => null)) as {
				error?: string;
			} | null;
			setError(body?.error ?? "Request failed");
			setIsLoading(false);
			return;
		}

		const body = (await result.json()) as { message: string };
		setResponse(body.message);
		setIsLoading(false);
	};

	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-zinc-900">Secure Message</h2>
				<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
					/api/secure-message
				</span>
			</div>
			<p className="mt-2 text-sm text-zinc-500">
				Auth middleware + Zod validation demo. Requires a valid session.
			</p>
			<form onSubmit={handleSubmit} className="mt-4 space-y-3">
				<div className="flex flex-col gap-2">
					<label
						className="text-sm font-medium text-zinc-700"
						htmlFor="message"
					>
						Message
					</label>
					<input
						id="message"
						value={message}
						onChange={(event) => setMessage(event.target.value)}
						placeholder="Say hello to the secure API"
						className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
					/>
				</div>
				<button
					type="submit"
					disabled={isLoading}
					className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
				>
					{isLoading ? "Sending..." : "Send secure message"}
				</button>
			</form>
			{response ? (
				<p className="mt-4 text-sm font-medium text-emerald-600">{response}</p>
			) : null}
			{error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
		</div>
	);
}
