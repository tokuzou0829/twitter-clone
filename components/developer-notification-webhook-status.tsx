"use client";

import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Clock3,
	Loader2,
	Webhook,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type DeveloperNotificationWebhookSummary,
	fetchDeveloperNotificationWebhooks,
} from "@/lib/social-api";

type DeveloperNotificationWebhookStatusProps = {
	isDeveloper: boolean;
	sessionUserId: string | null;
	onRequireDeveloper: () => void;
};

export function DeveloperNotificationWebhookStatus({
	isDeveloper,
	sessionUserId,
	onRequireDeveloper,
}: DeveloperNotificationWebhookStatusProps) {
	const [webhooks, setWebhooks] = useState<
		DeveloperNotificationWebhookSummary[]
	>([]);
	const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!sessionUserId || !isDeveloper) {
			return;
		}

		let ignore = false;

		const loadWebhooks = async () => {
			setIsLoadingWebhooks(true);
			setError(null);

			try {
				const nextWebhooks = await fetchDeveloperNotificationWebhooks();
				if (ignore) {
					return;
				}
				setWebhooks(nextWebhooks);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setError(loadError.message);
				} else {
					setError("Webhook購読状況の取得に失敗しました");
				}
			} finally {
				if (!ignore) {
					setIsLoadingWebhooks(false);
				}
			}
		};

		void loadWebhooks();

		return () => {
			ignore = true;
		};
	}, [isDeveloper, sessionUserId]);

	if (!sessionUserId) {
		return (
			<section className="border-b border-slate-200 px-5 py-4">
				<p className="text-lg font-semibold text-slate-900">
					Notification Webhook Subscriptions
				</p>
				<p className="mt-2 text-sm text-slate-600">
					ログインするとWebhook購読状況を確認できます。
				</p>
			</section>
		);
	}

	if (!isDeveloper) {
		return (
			<section className="border-b border-slate-200 px-5 py-4">
				<p className="text-lg font-semibold text-slate-900">
					Notification Webhook Subscriptions
				</p>
				<p className="mt-2 text-sm text-slate-600">
					購読状況の確認には開発者登録が必要です。
				</p>
				<button
					type="button"
					onClick={onRequireDeveloper}
					className="mt-3 rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)]"
				>
					開発者として登録
				</button>
			</section>
		);
	}

	return (
		<section className="border-b border-slate-200 px-5 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-lg font-semibold text-slate-900">
						Notification Webhook Subscriptions
					</p>
					<p className="text-sm text-slate-600">
						現在の購読先と最終配信ステータスを確認できます。
					</p>
				</div>
				<span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
					<Webhook className="h-3.5 w-3.5" />
					Subscriptions: {webhooks.length}
				</span>
			</div>

			{error ? (
				<p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
					{error}
				</p>
			) : null}

			<div className="mt-4">
				{isLoadingWebhooks ? (
					<p className="inline-flex items-center gap-2 text-sm text-slate-600">
						<Loader2 className="h-4 w-4 animate-spin" />
						Webhook購読状況を読み込み中...
					</p>
				) : webhooks.length === 0 ? (
					<div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
						購読Webhookはまだ登録されていません。
					</div>
				) : (
					<ul className="space-y-3">
						{webhooks.map((webhook) => {
							const deliveryStatus = resolveDeliveryStatus(webhook);
							return (
								<li
									key={webhook.id}
									className="rounded-lg border border-slate-200 bg-slate-50 p-3"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-sm font-semibold text-slate-900">
												{webhook.name}
											</p>
											<p className="font-mono text-xs text-slate-600">
												{webhook.endpoint}
											</p>
										</div>
										<span
											className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
												webhook.isActive
													? "bg-emerald-100 text-emerald-700"
													: "bg-slate-200 text-slate-600"
											}`}
										>
											<Activity className="h-3.5 w-3.5" />
											{webhook.isActive ? "Active" : "Inactive"}
										</span>
									</div>

									<div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
										<p>作成: {formatDateTime(webhook.createdAt)}</p>
										<p>更新: {formatDateTime(webhook.updatedAt)}</p>
										<p className="inline-flex items-center gap-1">
											<Clock3 className="h-3.5 w-3.5" />
											最終送信: {formatDateTime(webhook.lastSentAt)}
										</p>
										<p
											className={`inline-flex items-center gap-1 font-semibold ${deliveryStatus.toneClassName}`}
										>
											<deliveryStatus.icon className="h-3.5 w-3.5" />
											最終配信: {deliveryStatus.label}
										</p>
									</div>

									{webhook.lastError ? (
										<p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
											最終エラー: {webhook.lastError}
										</p>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</section>
	);
}

const formatDateTime = (value: string | null) => {
	if (!value) {
		return "未送信";
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return "-";
	}

	return parsed.toLocaleString(undefined, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
};

const resolveDeliveryStatus = (
	webhook: DeveloperNotificationWebhookSummary,
) => {
	if (webhook.lastSentAt === null) {
		return {
			label: "未送信",
			toneClassName: "text-slate-600",
			icon: Clock3,
		};
	}

	if (
		typeof webhook.lastStatusCode === "number" &&
		webhook.lastStatusCode >= 200 &&
		webhook.lastStatusCode < 300
	) {
		return {
			label: `成功 (${webhook.lastStatusCode})`,
			toneClassName: "text-emerald-700",
			icon: CheckCircle2,
		};
	}

	if (webhook.lastStatusCode !== null) {
		return {
			label: `失敗 (${webhook.lastStatusCode})`,
			toneClassName: "text-rose-700",
			icon: XCircle,
		};
	}

	return {
		label: "失敗 (通信エラー)",
		toneClassName: "text-rose-700",
		icon: AlertCircle,
	};
};
