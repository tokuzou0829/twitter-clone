"use client";

import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

type MeData = {
	user: {
		name: string | null;
		email: string;
	};
	session: {
		id: string;
	};
};

export function MePanel() {
	const { data: session } = authClient.useSession();
	const [data, setData] = useState<MeData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let ignore = false;

		const load = async () => {
			setIsLoading(true);
			setError(null);
			setData(null);

			const response = await apiClient.api.auth.me.$get();

			if (ignore) {
				return;
			}

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				setError(body?.error ?? "Unauthorized");
				setIsLoading(false);
				return;
			}

			const body = (await response.json()) as MeData;
			setData(body);
			setIsLoading(false);
		};

		void load();

		return () => {
			ignore = true;
		};
	}, []);

	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-zinc-900">API Session</h2>
				<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
					/api/me
				</span>
			</div>
			<div className="mt-4 space-y-2 text-sm text-zinc-600">
				{isLoading ? (
					<p>Loading session...</p>
				) : error ? (
					<p>{error}</p>
				) : data ? (
					<div className="space-y-1">
						<p className="font-medium text-zinc-900">
							{data.user.name ?? "Unnamed"}
						</p>
						<p>{data.user.email}</p>
						<p className="text-xs text-zinc-500">Session: {data.session.id}</p>
					</div>
				) : (
					<p>No session found.</p>
				)}
			</div>
		</div>
	);
}
