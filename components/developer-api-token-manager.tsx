"use client";

import { Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
	type DeveloperApiTokenSummary,
	fetchDeveloperApiTokens,
	issueDeveloperApiToken,
	revokeDeveloperApiToken,
} from "@/lib/social-api";

type DeveloperApiTokenManagerProps = {
	isDeveloper: boolean;
	sessionUserId: string | null;
	onRequireDeveloper: () => void;
};

type ExpiryOptionValue = "7" | "30" | "90" | "180" | "365" | "never";

const DEFAULT_TOKEN_NAME = "Developer CLI Token";
const TOKEN_EXPIRY_OPTIONS: Array<{ value: ExpiryOptionValue; label: string }> =
	[
		{ value: "7", label: "7日" },
		{ value: "30", label: "30日" },
		{ value: "90", label: "90日" },
		{ value: "180", label: "180日" },
		{ value: "365", label: "365日" },
		{ value: "never", label: "無期限" },
	];

export function DeveloperApiTokenManager({
	isDeveloper,
	sessionUserId,
	onRequireDeveloper,
}: DeveloperApiTokenManagerProps) {
	const [tokenName, setTokenName] = useState("");
	const [tokens, setTokens] = useState<DeveloperApiTokenSummary[]>([]);
	const [isLoadingTokens, setIsLoadingTokens] = useState(false);
	const [isIssuingToken, setIsIssuingToken] = useState(false);
	const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
	const [issuedTokenValue, setIssuedTokenValue] = useState<string | null>(null);
	const [isCopied, setIsCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expiryOption, setExpiryOption] = useState<ExpiryOptionValue>("90");

	useEffect(() => {
		if (!sessionUserId || !isDeveloper) {
			setTokens([]);
			setError(null);
			return;
		}

		let ignore = false;
		setIsLoadingTokens(true);
		setError(null);

		void fetchDeveloperApiTokens()
			.then((nextTokens) => {
				if (ignore) {
					return;
				}
				setTokens(nextTokens);
			})
			.catch((loadError) => {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setError(loadError.message);
				} else {
					setError("トークン一覧の取得に失敗しました");
				}
			})
			.finally(() => {
				if (!ignore) {
					setIsLoadingTokens(false);
				}
			});

		return () => {
			ignore = true;
		};
	}, [isDeveloper, sessionUserId]);

	const handleIssueToken = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!isDeveloper) {
			onRequireDeveloper();
			return;
		}

		setError(null);
		setIsIssuingToken(true);
		setIssuedTokenValue(null);
		setIsCopied(false);
		const expiresInDays =
			expiryOption === "never" ? null : Number.parseInt(expiryOption, 10);

		try {
			const issued = await issueDeveloperApiToken(
				tokenName.trim() || DEFAULT_TOKEN_NAME,
				expiresInDays,
			);
			setTokenName("");
			setIssuedTokenValue(issued.plainToken);
			setTokens((current) => {
				const filtered = current.filter(
					(token) => token.id !== issued.token.id,
				);
				return [issued.token, ...filtered];
			});
		} catch (issueError) {
			if (issueError instanceof Error) {
				setError(issueError.message);
			} else {
				setError("トークン発行に失敗しました");
			}
		} finally {
			setIsIssuingToken(false);
		}
	};

	const handleRevokeToken = async (tokenId: string) => {
		setError(null);
		setRevokingTokenId(tokenId);

		try {
			await revokeDeveloperApiToken(tokenId);
			setTokens((current) => {
				return current.filter((token) => token.id !== tokenId);
			});
		} catch (revokeError) {
			if (revokeError instanceof Error) {
				setError(revokeError.message);
			} else {
				setError("トークン失効に失敗しました");
			}
		} finally {
			setRevokingTokenId(null);
		}
	};

	const handleCopyToken = async () => {
		if (!issuedTokenValue) {
			return;
		}

		try {
			await navigator.clipboard.writeText(issuedTokenValue);
			setIsCopied(true);
		} catch {
			setError("トークンのコピーに失敗しました");
		}
	};

	if (!sessionUserId) {
		return (
			<section id="api-tokens" className="border-b border-slate-200 px-5 py-4">
				<p className="text-lg font-semibold text-slate-900">
					Developer API Tokens
				</p>
				<p className="mt-2 text-sm text-slate-600">
					ログインするとDeveloper APIトークンを発行できます。
				</p>
			</section>
		);
	}

	if (!isDeveloper) {
		return (
			<section id="api-tokens" className="border-b border-slate-200 px-5 py-4">
				<p className="text-lg font-semibold text-slate-900">
					Developer API Tokens
				</p>
				<p className="mt-2 text-sm text-slate-600">
					トークンを発行するには開発者登録が必要です。
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

	const activeTokens = tokens.filter((token) => !token.revokedAt);

	return (
		<section id="api-tokens" className="border-b border-slate-200 px-5 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-lg font-semibold text-slate-900">
						Developer API Tokens
					</p>
					<p className="text-sm text-slate-600">
						Bearerトークンで `/api/developer/v1/*` を操作できます。
					</p>
				</div>
				<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
					<ShieldCheck className="h-3.5 w-3.5" />
					Developer Access
				</span>
			</div>

			<form onSubmit={handleIssueToken} className="mt-4 space-y-2">
				<input
					type="text"
					value={tokenName}
					onChange={(event) => setTokenName(event.target.value)}
					placeholder={DEFAULT_TOKEN_NAME}
					maxLength={64}
					className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
				/>
				<div className="flex flex-col gap-2 sm:flex-row">
					<select
						value={expiryOption}
						onChange={(event) =>
							setExpiryOption(event.target.value as ExpiryOptionValue)
						}
						className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 sm:w-40"
					>
						{TOKEN_EXPIRY_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								有効期限: {option.label}
							</option>
						))}
					</select>
					<button
						type="submit"
						disabled={isIssuingToken}
						className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-md bg-[var(--brand-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isIssuingToken ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								発行中...
							</>
						) : (
							<>
								<KeyRound className="h-4 w-4" />
								トークン発行
							</>
						)}
					</button>
				</div>
			</form>

			{issuedTokenValue ? (
				<div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
					<p className="text-xs font-semibold text-amber-900">
						このトークンは今だけ表示されます。必ず安全に保存してください。
					</p>
					<pre className="mt-2 overflow-x-auto rounded bg-amber-100 px-3 py-2 font-mono text-xs text-amber-950">
						{issuedTokenValue}
					</pre>
					<button
						type="button"
						onClick={() => {
							void handleCopyToken();
						}}
						className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
					>
						<Copy className="h-3.5 w-3.5" />
						{isCopied ? "コピーしました" : "コピー"}
					</button>
				</div>
			) : null}

			{error ? (
				<p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
					{error}
				</p>
			) : null}

			<div className="mt-4">
				<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
					Issued Tokens
				</p>
				{isLoadingTokens ? (
					<p className="mt-2 text-sm text-slate-600">
						トークン一覧を読み込み中...
					</p>
				) : activeTokens.length === 0 ? (
					<p className="mt-2 text-sm text-slate-600">
						発行済みトークンはありません。
					</p>
				) : (
					<ul className="mt-2 space-y-2">
						{activeTokens.map((token) => {
							return (
								<li
									key={token.id}
									className="rounded-md border border-slate-200 bg-slate-50 p-3"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-sm font-semibold text-slate-900">
												{token.name}
											</p>
											<p className="font-mono text-xs text-slate-600">
												{token.tokenPrefix}...
											</p>
										</div>
										<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
											<ShieldCheck className="h-3.5 w-3.5" />
											Active
										</span>
									</div>

									<p className="mt-2 text-xs text-slate-600">
										発行: {formatDateTime(token.createdAt)} / 最終利用:{" "}
										{token.lastUsedAt
											? formatDateTime(token.lastUsedAt)
											: "未使用"}
									</p>
									<p className="mt-1 text-xs text-slate-600">
										有効期限: {formatExpiry(token.expiresAt)}
									</p>

									<button
										type="button"
										onClick={() => {
											void handleRevokeToken(token.id);
										}}
										disabled={revokingTokenId === token.id}
										className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{revokingTokenId === token.id ? "失効中..." : "失効する"}
									</button>
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
		return "-";
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

const formatExpiry = (value: string | null) => {
	if (value === null) {
		return "無期限";
	}

	return formatDateTime(value);
};
