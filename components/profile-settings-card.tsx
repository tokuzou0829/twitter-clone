"use client";

import { Camera, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
	disableTotp,
	enableTotp,
	verifyTotpEnrollment,
} from "@/lib/auth-actions";
import { authClient } from "@/lib/auth-client";
import {
	fetchMyProfile,
	type ProfileResponse,
	updateMyProfile,
} from "@/lib/social-api";
import {
	createDisplayHandle,
	isValidUserHandle,
	MAX_HANDLE_LENGTH,
	normalizeUserHandle,
	sanitizeUserHandleDraft,
} from "@/lib/user-handle";

type ProfileSettingsCardProps = {
	onSaved?: (profile: ProfileResponse) => void;
};

export function ProfileSettingsCard({ onSaved }: ProfileSettingsCardProps) {
	const { data: session, isPending } = authClient.useSession();
	const [profile, setProfile] = useState<ProfileResponse | null>(null);
	const [name, setName] = useState("");
	const [handle, setHandle] = useState("");
	const [bio, setBio] = useState("");
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [bannerFile, setBannerFile] = useState<File | null>(null);
	const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
	const [bannerObjectUrl, setBannerObjectUrl] = useState<string | null>(null);
	const [removeAvatar, setRemoveAvatar] = useState(false);
	const [removeBanner, setRemoveBanner] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false);
	const [twoFactorPassword, setTwoFactorPassword] = useState("");
	const [totpUri, setTotpUri] = useState<string | null>(null);
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [totpCode, setTotpCode] = useState("");
	const [twoFactorMessage, setTwoFactorMessage] = useState<string | null>(null);
	const [isTwoFactorBusy, setIsTwoFactorBusy] = useState(false);

	useEffect(() => {
		if (!session?.user) {
			setIsLoading(false);
			setProfile(null);
			return;
		}

		let ignore = false;
		const load = async () => {
			setIsLoading(true);
			setError(null);

			try {
				const nextProfile = await fetchMyProfile();
				if (ignore) {
					return;
				}
				setProfile(nextProfile);
				setName(nextProfile.user.name);
				setHandle(nextProfile.user.handle ?? "");
				setBio(nextProfile.user.bio ?? "");
				setIsTwoFactorEnabled(
					Boolean(
						(session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
					),
				);
			} catch (loadError) {
				if (ignore) {
					return;
				}
				if (loadError instanceof Error) {
					setError(loadError.message);
				} else {
					setError("Failed to load profile");
				}
			} finally {
				if (!ignore) {
					setIsLoading(false);
				}
			}
		};

		void load();

		return () => {
			ignore = true;
		};
	}, [session?.user]);

	useEffect(() => {
		if (!avatarFile) {
			setAvatarObjectUrl(null);
			return;
		}

		const nextUrl = URL.createObjectURL(avatarFile);
		setAvatarObjectUrl(nextUrl);

		return () => {
			URL.revokeObjectURL(nextUrl);
		};
	}, [avatarFile]);

	useEffect(() => {
		if (!bannerFile) {
			setBannerObjectUrl(null);
			return;
		}

		const nextUrl = URL.createObjectURL(bannerFile);
		setBannerObjectUrl(nextUrl);

		return () => {
			URL.revokeObjectURL(nextUrl);
		};
	}, [bannerFile]);

	const avatarPreview =
		avatarObjectUrl ?? (removeAvatar ? null : (profile?.user.image ?? null));
	const bannerPreview =
		bannerObjectUrl ??
		(removeBanner ? null : (profile?.user.bannerImage ?? null));
	const hasChanges =
		name !== (profile?.user.name ?? "") ||
		handle !== (profile?.user.handle ?? "") ||
		bio !== (profile?.user.bio ?? "") ||
		Boolean(avatarFile) ||
		Boolean(bannerFile) ||
		removeAvatar ||
		removeBanner;

	const handleEnableTotp = async () => {
		if (!twoFactorPassword.trim()) {
			setTwoFactorMessage("TOTP有効化にはパスワードが必要です");
			return;
		}

		setIsTwoFactorBusy(true);
		setTwoFactorMessage(null);
		const result = await enableTotp({
			password: twoFactorPassword,
			issuer: "Numatter",
		});
		if (!result.success) {
			setTwoFactorMessage(result.error ?? "TOTPの初期化に失敗しました");
			setIsTwoFactorBusy(false);
			return;
		}

		setTotpUri(result.totpURI ?? null);
		setBackupCodes(result.backupCodes ?? []);
		setTwoFactorMessage(
			"認証アプリでQR(URI)を追加し、コードを入力してください",
		);
		setIsTwoFactorBusy(false);
	};

	const handleVerifyTotpEnrollment = async () => {
		if (!totpCode.trim()) {
			setTwoFactorMessage("6桁コードを入力してください");
			return;
		}

		setIsTwoFactorBusy(true);
		setTwoFactorMessage(null);
		const result = await verifyTotpEnrollment(totpCode.trim());
		if (!result.success) {
			setTwoFactorMessage(result.error ?? "コード検証に失敗しました");
			setIsTwoFactorBusy(false);
			return;
		}

		setIsTwoFactorEnabled(true);
		setTotpUri(null);
		setTotpCode("");
		setTwoFactorMessage("TOTPを有効化しました");
		setIsTwoFactorBusy(false);
	};

	const handleDisableTotp = async () => {
		if (!twoFactorPassword.trim()) {
			setTwoFactorMessage("無効化にもパスワードが必要です");
			return;
		}

		setIsTwoFactorBusy(true);
		setTwoFactorMessage(null);
		const result = await disableTotp(twoFactorPassword);
		if (!result.success) {
			setTwoFactorMessage(result.error ?? "TOTP無効化に失敗しました");
			setIsTwoFactorBusy(false);
			return;
		}

		setIsTwoFactorEnabled(false);
		setTotpUri(null);
		setBackupCodes([]);
		setTotpCode("");
		setTwoFactorMessage("TOTPを無効化しました");
		setIsTwoFactorBusy(false);
	};

	if (isPending || isLoading) {
		return (
			<section className="border-b border-[var(--border-subtle)] px-4 py-5 text-sm text-[var(--text-subtle)]">
				プロフィールを読み込んでいます...
			</section>
		);
	}

	if (!session?.user) {
		return (
			<section className="border-b border-[var(--border-subtle)] px-4 py-5 text-sm text-[var(--text-subtle)]">
				<p>Log in to edit your profile.</p>
				<div className="mt-3 flex gap-2">
					<Link
						href="/login"
						className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-white"
					>
						Log in
					</Link>
					<Link
						href="/signup"
						className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-xs font-bold text-[var(--text-main)]"
					>
						アカウントを作成
					</Link>
				</div>
			</section>
		);
	}

	const handlePreview = createDisplayHandle({
		handle,
		name,
		userId: session.user.id,
	});
	const avatarFallback = (name.trim() || session.user.name || "U")
		.slice(0, 2)
		.toUpperCase();

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSaving(true);
		setError(null);

		const normalizedHandle = normalizeUserHandle(handle);
		if (normalizedHandle && !isValidUserHandle(normalizedHandle)) {
			setError(
				`ハンドルは英小文字・数字・_ のみ、${MAX_HANDLE_LENGTH}文字以内で入力してください`,
			);
			setIsSaving(false);
			return;
		}

		const formData = new FormData();
		formData.set("name", name);
		formData.set("handle", normalizedHandle);
		formData.set("bio", bio);
		if (avatarFile) {
			formData.set("avatar", avatarFile);
		}
		if (bannerFile) {
			formData.set("banner", bannerFile);
		}
		if (removeAvatar) {
			formData.set("removeAvatar", "true");
		}
		if (removeBanner) {
			formData.set("removeBanner", "true");
		}

		try {
			const updated = await updateMyProfile(formData);
			setProfile(updated);
			setName(updated.user.name);
			setHandle(updated.user.handle ?? "");
			setBio(updated.user.bio ?? "");
			setAvatarFile(null);
			setBannerFile(null);
			setRemoveAvatar(false);
			setRemoveBanner(false);
			onSaved?.(updated);
		} catch (submitError) {
			if (submitError instanceof Error) {
				setError(submitError.message);
			} else {
				setError("Failed to update profile");
			}
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<section className="bg-[var(--surface-main)]">
			<form onSubmit={handleSubmit}>
				<div className="relative h-48 bg-[linear-gradient(135deg,#1d9bf0,#198ad0,#0f5f8a)]">
					{bannerPreview ? (
						<img
							src={bannerPreview}
							alt="Profile banner"
							className="h-full w-full object-cover"
						/>
					) : null}
					<div className="absolute inset-0 bg-black/20" />
					<div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
						<label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70">
							<Camera className="h-4 w-4" />
							<input
								type="file"
								accept="image/*"
								className="hidden"
								onChange={(event) => {
									setBannerFile(event.target.files?.[0] ?? null);
									setRemoveBanner(false);
								}}
							/>
						</label>
						{bannerPreview ? (
							<button
								type="button"
								onClick={() => {
									setRemoveBanner(true);
									setBannerFile(null);
								}}
								className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
								aria-label="Remove banner"
							>
								<Trash2 className="h-4 w-4" />
							</button>
						) : null}
					</div>
				</div>

				<div className="px-4">
					<div className="-mt-14 flex items-end justify-between gap-3">
						<div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-[var(--surface-main)] bg-zinc-100">
							{avatarPreview ? (
								<img
									src={avatarPreview}
									alt="Account avatar"
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center text-lg font-extrabold text-zinc-500">
									{avatarFallback}
								</div>
							)}
							<label className="absolute bottom-1 right-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--surface-main)] bg-black/65 text-white transition hover:bg-black/80">
								<Camera className="h-4 w-4" />
								<input
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(event) => {
										setAvatarFile(event.target.files?.[0] ?? null);
										setRemoveAvatar(false);
									}}
								/>
							</label>
						</div>

						{avatarPreview ? (
							<button
								type="button"
								onClick={() => {
									setRemoveAvatar(true);
									setAvatarFile(null);
								}}
								className="rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] transition hover:bg-[var(--surface-muted)]"
							>
								アバターを削除
							</button>
						) : null}
					</div>

					<div className="mt-3">
						<p className="text-lg font-extrabold text-[var(--text-main)]">
							{name || "Unnamed"}
						</p>
						<p className="text-sm text-[var(--text-subtle)]">{handlePreview}</p>
					</div>
				</div>

				<div className="mt-4 space-y-3 px-4">
					<label
						htmlFor="name"
						className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2"
					>
						<span className="text-xs font-bold text-[var(--text-subtle)]">
							Name
						</span>
						<input
							id="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							maxLength={50}
							className="mt-1 w-full border-0 bg-transparent p-0 text-base text-[var(--text-main)] outline-none"
						/>
						<span className="mt-1 block text-right text-xs text-[var(--text-subtle)]">
							{name.length}/50
						</span>
					</label>

					<label
						htmlFor="handle"
						className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2"
					>
						<span className="text-xs font-bold text-[var(--text-subtle)]">
							Handle
						</span>
						<div className="relative mt-1">
							<span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-base text-[var(--text-subtle)]">
								@
							</span>
							<input
								id="handle"
								value={handle}
								onChange={(event) => {
									setHandle(sanitizeUserHandleDraft(event.target.value));
								}}
								maxLength={MAX_HANDLE_LENGTH}
								className="w-full border-0 bg-transparent p-0 pl-5 text-base text-[var(--text-main)] outline-none"
							/>
						</div>
						<span className="mt-1 block text-right text-xs text-[var(--text-subtle)]">
							{handle.length}/{MAX_HANDLE_LENGTH}
						</span>
					</label>

					<label
						htmlFor="bio"
						className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2"
					>
						<span className="text-xs font-bold text-[var(--text-subtle)]">
							Bio
						</span>
						<textarea
							id="bio"
							value={bio}
							onChange={(event) => setBio(event.target.value)}
							maxLength={160}
							rows={4}
							className="mt-1 w-full resize-none border-0 bg-transparent p-0 text-base text-[var(--text-main)] outline-none"
						/>
						<span className="mt-1 block text-right text-xs text-[var(--text-subtle)]">
							{bio.length}/160
						</span>
					</label>
				</div>

				<div className="mt-6 space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-4">
					<p className="text-sm font-bold text-[var(--text-main)]">
						二段階認証 (TOTP)
					</p>
					<p className="text-xs text-[var(--text-subtle)]">
						現在: {isTwoFactorEnabled ? "有効" : "無効"}
					</p>
					<label className="block space-y-1">
						<span className="text-xs font-bold text-[var(--text-subtle)]">
							確認用パスワード
						</span>
						<input
							type="password"
							value={twoFactorPassword}
							onChange={(event) => setTwoFactorPassword(event.target.value)}
							className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-white px-3 text-sm text-[var(--text-main)] outline-none transition focus:border-sky-400"
						/>
					</label>

					{totpUri ? (
						<div className="space-y-2 rounded-xl border border-dashed border-[var(--border-subtle)] bg-white p-3">
							<p className="text-xs text-[var(--text-subtle)]">
								認証アプリに次のURIを登録してください:
							</p>
							<p className="break-all text-xs text-[var(--text-main)]">
								{totpUri}
							</p>
							<input
								inputMode="numeric"
								placeholder="6桁コード"
								value={totpCode}
								onChange={(event) =>
									setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 8))
								}
								className="h-10 w-full rounded-xl border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-main)] outline-none transition focus:border-sky-400"
							/>
							<button
								type="button"
								onClick={() => {
									void handleVerifyTotpEnrollment();
								}}
								disabled={isTwoFactorBusy}
								className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
							>
								コードを検証
							</button>
						</div>
					) : null}

					{backupCodes.length > 0 ? (
						<div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
							<p className="text-xs font-semibold text-amber-800">
								バックアップコード (安全な場所に保存)
							</p>
							<p className="mt-1 break-all text-xs text-amber-900">
								{backupCodes.join(", ")}
							</p>
						</div>
					) : null}

					<div className="flex gap-2">
						{!isTwoFactorEnabled ? (
							<button
								type="button"
								onClick={() => {
									void handleEnableTotp();
								}}
								disabled={isTwoFactorBusy}
								className="rounded-full border border-[var(--border-subtle)] bg-white px-4 py-2 text-xs font-bold text-[var(--text-main)] disabled:opacity-60"
							>
								有効化を開始
							</button>
						) : (
							<button
								type="button"
								onClick={() => {
									void handleDisableTotp();
								}}
								disabled={isTwoFactorBusy}
								className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-60"
							>
								無効化
							</button>
						)}
					</div>

					{twoFactorMessage ? (
						<p className="text-xs text-[var(--text-subtle)]">
							{twoFactorMessage}
						</p>
					) : null}
				</div>

				<div className="sticky bottom-0 z-10 mt-5 border-t border-[var(--border-subtle)] bg-white/95 px-4 py-3 backdrop-blur">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex gap-4 text-xs text-[var(--text-subtle)]">
							<span>{profile?.stats.posts ?? 0} 投稿</span>
							<span>{profile?.stats.followers ?? 0} フォロワー</span>
							<span>{profile?.stats.following ?? 0} フォロー中</span>
						</div>
						<button
							type="submit"
							disabled={isSaving || !hasChanges}
							className="rounded-full bg-[var(--text-main)] px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{isSaving ? "保存中..." : "保存"}
						</button>
					</div>
					{error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
				</div>
			</form>
		</section>
	);
}
