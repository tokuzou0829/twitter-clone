"use client";

import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Clock3,
	Copy,
	Loader2,
	Pencil,
	RotateCw,
	Send,
	Trash2,
	Webhook,
	X,
	XCircle,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
	createDeveloperNotificationWebhook,
	type DeveloperNotificationWebhookSummary,
	deleteDeveloperNotificationWebhook,
	fetchDeveloperNotificationWebhooks,
	sendDeveloperNotificationWebhook,
	updateDeveloperNotificationWebhook,
} from "@/lib/social-api";

type DeveloperNotificationWebhookStatusProps = {
	isDeveloper: boolean;
	sessionUserId: string | null;
	onRequireDeveloper: () => void;
};

type EditingWebhookState = {
	webhookId: string;
	name: string;
	endpoint: string;
	isActive: boolean;
};

type BusyWebhookAction = {
	webhookId: string;
	type: "save" | "delete" | "toggle" | "send" | "rotate";
} | null;

const DEFAULT_WEBHOOK_NAME = "Main Hook";

export function DeveloperNotificationWebhookStatus({
	isDeveloper,
	sessionUserId,
	onRequireDeveloper,
}: DeveloperNotificationWebhookStatusProps) {
	const [webhooks, setWebhooks] = useState<
		DeveloperNotificationWebhookSummary[]
	>([]);
	const [webhookName, setWebhookName] = useState("");
	const [webhookEndpoint, setWebhookEndpoint] = useState("");
	const [webhookSecret, setWebhookSecret] = useState("");
	const [webhookIsActive, setWebhookIsActive] = useState(true);
	const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false);
	const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
	const [busyWebhookAction, setBusyWebhookAction] =
		useState<BusyWebhookAction>(null);
	const [editingWebhook, setEditingWebhook] =
		useState<EditingWebhookState | null>(null);
	const [latestSecret, setLatestSecret] = useState<{
		name: string;
		value: string;
	} | null>(null);
	const [isSecretCopied, setIsSecretCopied] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const activeWebhookCount = webhooks.filter(
		(webhook) => webhook.isActive,
	).length;

	const loadWebhooks = useCallback(async () => {
		if (!sessionUserId || !isDeveloper) {
			setWebhooks([]);
			return;
		}

		setIsLoadingWebhooks(true);
		setError(null);

		try {
			const nextWebhooks = await fetchDeveloperNotificationWebhooks();
			setWebhooks(nextWebhooks);
		} catch (loadError) {
			if (loadError instanceof Error) {
				setError(loadError.message);
			} else {
				setError("Webhook購読状況の取得に失敗しました");
			}
		} finally {
			setIsLoadingWebhooks(false);
		}
	}, [isDeveloper, sessionUserId]);

	useEffect(() => {
		if (!sessionUserId || !isDeveloper) {
			setWebhooks([]);
			setEditingWebhook(null);
			setError(null);
			return;
		}

		let ignore = false;

		const loadWebhooksOnMount = async () => {
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

		void loadWebhooksOnMount();

		return () => {
			ignore = true;
		};
	}, [isDeveloper, sessionUserId]);

	const handleCreateWebhook = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!isDeveloper) {
			onRequireDeveloper();
			return;
		}

		setError(null);
		setNotice(null);
		setIsCreatingWebhook(true);
		setIsSecretCopied(false);

		try {
			const created = await createDeveloperNotificationWebhook({
				name: webhookName.trim() || DEFAULT_WEBHOOK_NAME,
				endpoint: webhookEndpoint.trim(),
				...(webhookSecret.trim() ? { secret: webhookSecret.trim() } : {}),
				isActive: webhookIsActive,
			});

			setLatestSecret({
				name: created.webhook.name,
				value: created.plainSecret,
			});
			setWebhookName("");
			setWebhookEndpoint("");
			setWebhookSecret("");
			setWebhookIsActive(true);
			setNotice("Webhookを登録しました");
			await loadWebhooks();
		} catch (createError) {
			if (createError instanceof Error) {
				setError(createError.message);
			} else {
				setError("Webhookの登録に失敗しました");
			}
		} finally {
			setIsCreatingWebhook(false);
		}
	};

	const handleCopySecret = async () => {
		if (!latestSecret) {
			return;
		}

		try {
			await navigator.clipboard.writeText(latestSecret.value);
			setIsSecretCopied(true);
		} catch {
			setError("シークレットのコピーに失敗しました");
		}
	};

	const startEditingWebhook = (
		webhook: DeveloperNotificationWebhookSummary,
	) => {
		setEditingWebhook({
			webhookId: webhook.id,
			name: webhook.name,
			endpoint: webhook.endpoint,
			isActive: webhook.isActive,
		});
		setError(null);
		setNotice(null);
	};

	const handleSaveWebhook = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!editingWebhook) {
			return;
		}

		const currentWebhook = webhooks.find(
			(webhook) => webhook.id === editingWebhook.webhookId,
		);
		if (!currentWebhook) {
			setEditingWebhook(null);
			return;
		}

		const normalizedName = editingWebhook.name.trim();
		const normalizedEndpoint = editingWebhook.endpoint.trim();
		const payload = {
			...(normalizedName !== currentWebhook.name
				? { name: normalizedName }
				: {}),
			...(normalizedEndpoint !== currentWebhook.endpoint
				? { endpoint: normalizedEndpoint }
				: {}),
			...(editingWebhook.isActive !== currentWebhook.isActive
				? { isActive: editingWebhook.isActive }
				: {}),
		};

		if (Object.keys(payload).length === 0) {
			setEditingWebhook(null);
			return;
		}

		setError(null);
		setNotice(null);
		setBusyWebhookAction({ webhookId: currentWebhook.id, type: "save" });

		try {
			await updateDeveloperNotificationWebhook(currentWebhook.id, payload);
			setEditingWebhook(null);
			setNotice("Webhookを更新しました");
			await loadWebhooks();
		} catch (updateError) {
			if (updateError instanceof Error) {
				setError(updateError.message);
			} else {
				setError("Webhookの更新に失敗しました");
			}
		} finally {
			setBusyWebhookAction(null);
		}
	};

	const handleToggleWebhook = async (
		webhook: DeveloperNotificationWebhookSummary,
	) => {
		setError(null);
		setNotice(null);
		setBusyWebhookAction({ webhookId: webhook.id, type: "toggle" });

		try {
			await updateDeveloperNotificationWebhook(webhook.id, {
				isActive: !webhook.isActive,
			});
			setNotice(
				webhook.isActive
					? `${webhook.name} を停止しました`
					: `${webhook.name} を有効化しました`,
			);
			await loadWebhooks();
		} catch (toggleError) {
			if (toggleError instanceof Error) {
				setError(toggleError.message);
			} else {
				setError("Webhook状態の更新に失敗しました");
			}
		} finally {
			setBusyWebhookAction(null);
		}
	};

	const handleRotateSecret = async (
		webhook: DeveloperNotificationWebhookSummary,
	) => {
		const confirmed = window.confirm(
			`Webhook「${webhook.name}」のシークレットを再生成しますか？`,
		);
		if (!confirmed) {
			return;
		}

		setError(null);
		setNotice(null);
		setBusyWebhookAction({ webhookId: webhook.id, type: "rotate" });
		setIsSecretCopied(false);

		try {
			const updated = await updateDeveloperNotificationWebhook(webhook.id, {
				rotateSecret: true,
			});
			if (updated.plainSecret) {
				setLatestSecret({
					name: updated.webhook.name,
					value: updated.plainSecret,
				});
			}
			setNotice("Webhookシークレットを再生成しました");
			await loadWebhooks();
		} catch (rotateError) {
			if (rotateError instanceof Error) {
				setError(rotateError.message);
			} else {
				setError("シークレット再生成に失敗しました");
			}
		} finally {
			setBusyWebhookAction(null);
		}
	};

	const handleDeleteWebhook = async (
		webhook: DeveloperNotificationWebhookSummary,
	) => {
		const confirmed = window.confirm(
			`Webhook「${webhook.name}」を削除しますか？`,
		);
		if (!confirmed) {
			return;
		}

		setError(null);
		setNotice(null);
		setBusyWebhookAction({ webhookId: webhook.id, type: "delete" });

		try {
			await deleteDeveloperNotificationWebhook(webhook.id);
			if (editingWebhook?.webhookId === webhook.id) {
				setEditingWebhook(null);
			}
			setNotice("Webhookを削除しました");
			await loadWebhooks();
		} catch (deleteError) {
			if (deleteError instanceof Error) {
				setError(deleteError.message);
			} else {
				setError("Webhookの削除に失敗しました");
			}
		} finally {
			setBusyWebhookAction(null);
		}
	};

	const handleSendWebhook = async (
		webhook: DeveloperNotificationWebhookSummary,
	) => {
		setError(null);
		setNotice(null);
		setBusyWebhookAction({ webhookId: webhook.id, type: "send" });

		try {
			const sent = await sendDeveloperNotificationWebhook(webhook.id);
			const result = sent.results[0];
			if (result?.status === "failed") {
				setError(
					result.error ??
						`テスト送信に失敗しました (${result.statusCode ?? "通信エラー"})`,
				);
			} else {
				setNotice(
					`テスト送信を実行しました (${result?.statusCode ?? "status unknown"})`,
				);
			}
			await loadWebhooks();
		} catch (sendError) {
			if (sendError instanceof Error) {
				setError(sendError.message);
			} else {
				setError("テスト送信に失敗しました");
			}
		} finally {
			setBusyWebhookAction(null);
		}
	};

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
						Webhookの登録・編集・削除とテスト送信を行えます。
					</p>
				</div>
				<span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
					<Webhook className="h-3.5 w-3.5" />
					Subscriptions: {webhooks.length} (Active: {activeWebhookCount})
				</span>
			</div>

			<form onSubmit={handleCreateWebhook} className="mt-4 space-y-2">
				<input
					type="text"
					value={webhookName}
					onChange={(event) => setWebhookName(event.target.value)}
					placeholder={DEFAULT_WEBHOOK_NAME}
					maxLength={64}
					className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
				/>
				<input
					type="url"
					required
					value={webhookEndpoint}
					onChange={(event) => setWebhookEndpoint(event.target.value)}
					placeholder="https://example.com/webhooks/notifications"
					maxLength={2048}
					className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
				/>
				<input
					type="text"
					value={webhookSecret}
					onChange={(event) => setWebhookSecret(event.target.value)}
					placeholder="Optional: secret (空欄なら自動生成)"
					maxLength={256}
					className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
				/>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<label className="inline-flex items-center gap-2 text-sm text-slate-700">
						<input
							type="checkbox"
							checked={webhookIsActive}
							onChange={(event) => setWebhookIsActive(event.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-sky-600"
						/>
						作成時に有効化
					</label>
					<button
						type="submit"
						disabled={isCreatingWebhook}
						className="inline-flex h-10 items-center justify-center gap-1 rounded-md bg-[var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isCreatingWebhook ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								登録中...
							</>
						) : (
							"Webhookを登録"
						)}
					</button>
				</div>
			</form>

			{latestSecret ? (
				<div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
					<p className="text-xs font-semibold text-amber-900">
						{latestSecret.name} のシークレットです。この値は今だけ表示されます。
					</p>
					<pre className="mt-2 overflow-x-auto rounded bg-amber-100 px-3 py-2 font-mono text-xs text-amber-950">
						{latestSecret.value}
					</pre>
					<button
						type="button"
						onClick={() => {
							void handleCopySecret();
						}}
						className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
					>
						<Copy className="h-3.5 w-3.5" />
						{isSecretCopied ? "コピーしました" : "コピー"}
					</button>
				</div>
			) : null}

			{notice ? (
				<p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
					{notice}
				</p>
			) : null}

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
							const isEditing = editingWebhook?.webhookId === webhook.id;
							const isBusy = busyWebhookAction?.webhookId === webhook.id;
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

									<div className="mt-3 flex flex-wrap gap-2">
										<button
											type="button"
											onClick={() => {
												void handleSendWebhook(webhook);
											}}
											disabled={Boolean(isBusy)}
											className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{busyWebhookAction?.type === "send" && isBusy ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<Send className="h-3.5 w-3.5" />
											)}
											テスト送信
										</button>
										{isEditing ? (
											<button
												type="button"
												onClick={() => setEditingWebhook(null)}
												disabled={Boolean(isBusy)}
												className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
											>
												<X className="h-3.5 w-3.5" />
												編集を閉じる
											</button>
										) : (
											<button
												type="button"
												onClick={() => startEditingWebhook(webhook)}
												disabled={Boolean(isBusy)}
												className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
											>
												<Pencil className="h-3.5 w-3.5" />
												編集
											</button>
										)}
										<button
											type="button"
											onClick={() => {
												void handleToggleWebhook(webhook);
											}}
											disabled={Boolean(isBusy)}
											className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{busyWebhookAction?.type === "toggle" && isBusy ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<Activity className="h-3.5 w-3.5" />
											)}
											{webhook.isActive ? "停止" : "有効化"}
										</button>
										<button
											type="button"
											onClick={() => {
												void handleRotateSecret(webhook);
											}}
											disabled={Boolean(isBusy)}
											className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{busyWebhookAction?.type === "rotate" && isBusy ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<RotateCw className="h-3.5 w-3.5" />
											)}
											Secret再生成
										</button>
										<button
											type="button"
											onClick={() => {
												void handleDeleteWebhook(webhook);
											}}
											disabled={Boolean(isBusy)}
											className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{busyWebhookAction?.type === "delete" && isBusy ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<Trash2 className="h-3.5 w-3.5" />
											)}
											削除
										</button>
									</div>

									<div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
										<p>作成: {formatDateTime(webhook.createdAt)}</p>
										<p>更新: {formatDateTime(webhook.updatedAt)}</p>
										<p className="inline-flex items-center gap-1">
											<Clock3 className="h-3.5 w-3.5" />
											最終送信: {formatDateTime(webhook.lastSentAt, "未送信")}
										</p>
										<p
											className={`inline-flex items-center gap-1 font-semibold ${deliveryStatus.toneClassName}`}
										>
											<deliveryStatus.icon className="h-3.5 w-3.5" />
											最終配信: {deliveryStatus.label}
										</p>
									</div>

									{isEditing && editingWebhook ? (
										<form
											onSubmit={handleSaveWebhook}
											className="mt-3 space-y-2"
										>
											<input
												type="text"
												required
												maxLength={64}
												value={editingWebhook.name}
												onChange={(event) => {
													setEditingWebhook((current) => {
														if (!current) {
															return null;
														}
														return {
															...current,
															name: event.target.value,
														};
													});
												}}
												className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
											/>
											<input
												type="url"
												required
												maxLength={2048}
												value={editingWebhook.endpoint}
												onChange={(event) => {
													setEditingWebhook((current) => {
														if (!current) {
															return null;
														}
														return {
															...current,
															endpoint: event.target.value,
														};
													});
												}}
												className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
											/>
											<label className="inline-flex items-center gap-2 text-xs text-slate-700">
												<input
													type="checkbox"
													checked={editingWebhook.isActive}
													onChange={(event) => {
														setEditingWebhook((current) => {
															if (!current) {
																return null;
															}
															return {
																...current,
																isActive: event.target.checked,
															};
														});
													}}
													className="h-4 w-4 rounded border-slate-300 text-sky-600"
												/>
												有効化状態
											</label>
											<div className="flex gap-2">
												<button
													type="submit"
													disabled={
														busyWebhookAction?.type === "save" && isBusy
													}
													className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--brand-primary)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
												>
													{busyWebhookAction?.type === "save" && isBusy ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
													) : null}
													保存
												</button>
												<button
													type="button"
													onClick={() => setEditingWebhook(null)}
													disabled={
														busyWebhookAction?.type === "save" && isBusy
													}
													className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
												>
													キャンセル
												</button>
											</div>
										</form>
									) : null}

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

const formatDateTime = (value: string | null, fallback = "-") => {
	if (!value) {
		return fallback;
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
