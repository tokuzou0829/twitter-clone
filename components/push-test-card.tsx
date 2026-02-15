"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useNotificationManager } from "@/hooks/use-notification-manager";
import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

type SendResult = {
	total: number;
	sent: number;
	failed: number;
	removed: number;
};

export function PushTestCard() {
	const { data: session } = authClient.useSession();
	const {
		isSupported,
		subscribeToPush,
		getSubscriptionStatus,
		error: notificationError,
	} = useNotificationManager();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [url, setUrl] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<SendResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
	const [isChecking, setIsChecking] = useState(false);

	const refreshStatus = useCallback(async () => {
		if (!session || !isSupported) {
			setIsSubscribed(null);
			return;
		}

		setIsChecking(true);
		const status = await getSubscriptionStatus();
		setIsSubscribed(status);
		setIsChecking(false);
	}, [getSubscriptionStatus, isSupported, session]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			void refreshStatus();
		}, 0);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [refreshStatus]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setError(null);
		setResult(null);

		if (!session) {
			setError("Please log in.");
			setIsLoading(false);
			return;
		}

		const response = await apiClient.api.notifications["send-test"].$post({
			json: {
				title,
				body,
				url,
			},
		});

		if (!response.ok) {
			const errorBody = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;
			setError(errorBody?.error ?? "Failed to send notification.");
			setIsLoading(false);
			return;
		}

		const bodyJson = (await response.json()) as SendResult;
		setResult(bodyJson);
		setIsLoading(false);
		await refreshStatus();
	};

	const handleSubscribe = async () => {
		setError(null);
		await subscribeToPush();
		await refreshStatus();
	};

	return (
		<div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-zinc-900">
					Test push notification
				</h2>
				<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
					/api/notifications/send-test
				</span>
			</div>
			<p className="mt-2 text-sm text-zinc-500">
				Send a test notification to the current account.
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
				<span>Support: {isSupported ? "Available" : "Unavailable"}</span>
				<span>
					Subscription:{" "}
					{isChecking
						? "Checking..."
						: isSubscribed === null
							? "Unknown"
							: isSubscribed
								? "Active"
								: "Inactive"}
				</span>
				{session ? null : <span>Login required</span>}
			</div>
			<button
				type="button"
				onClick={handleSubscribe}
				disabled={
					!session || !isSupported || isLoading || isSubscribed === true
				}
				className="mt-3 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-70"
			>
				Enable notifications
			</button>
			<form onSubmit={handleSubmit} className="mt-4 space-y-3">
				<div className="flex flex-col gap-2">
					<label
						className="text-sm font-medium text-zinc-700"
						htmlFor="push-title"
					>
						Title
					</label>
					<input
						id="push-title"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						required
						placeholder="Test notification"
						className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label
						className="text-sm font-medium text-zinc-700"
						htmlFor="push-body"
					>
						Body
					</label>
					<textarea
						id="push-body"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						required
						rows={3}
						placeholder="This is a test push notification."
						className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
					/>
				</div>
				<div className="flex flex-col gap-2">
					<label
						className="text-sm font-medium text-zinc-700"
						htmlFor="push-url"
					>
						URL
					</label>
					<input
						id="push-url"
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						required
						type="url"
						placeholder="https://example.com"
						className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400"
					/>
				</div>
				<button
					type="submit"
					disabled={isLoading || !session}
					className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
				>
					{isLoading ? "Sending..." : "Send test notification"}
				</button>
			</form>
			{result ? (
				<p className="mt-4 text-sm font-medium text-emerald-600">
					Sent {result.sent}/{result.total}. Failed {result.failed}. Removed{" "}
					{result.removed} expired subscriptions.
				</p>
			) : null}
			{error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
			{notificationError ? (
				<p className="mt-2 text-xs text-rose-500">{notificationError}</p>
			) : null}
		</div>
	);
}
