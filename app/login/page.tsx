"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { signInWithEmail, verifyTotpForSignIn } from "@/lib/auth-actions";

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		const result = await signInWithEmail({
			email,
			password,
		});

		if (!result.success) {
			if (result.requiresTwoFactor) {
				setRequiresTwoFactor(true);
				setError(null);
				setIsLoading(false);
				return;
			}

			setError(result.error ?? "Login failed");
			setIsLoading(false);
			return;
		}

		router.push("/");
	};

	const handleVerifyTotp = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsLoading(true);
		setError(null);

		const result = await verifyTotpForSignIn(totpCode.trim());
		if (!result.success) {
			setError(result.error ?? "2FA verification failed");
			setIsLoading(false);
			return;
		}

		router.push("/");
	};

	return (
		<div className="min-h-screen bg-[var(--app-bg)]">
			<div className="mx-auto grid min-h-screen w-full max-w-[1100px] grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
				<section className="hidden flex-col justify-between bg-[linear-gradient(135deg,#1d9bf0,#198ad0,#0f5f8a)] p-12 text-white lg:flex">
					<Link href="/" className="text-2xl font-extrabold tracking-tight">
						Numatter
					</Link>
					<div>
						<h1 className="mt-4 text-5xl font-extrabold leading-tight">
							ずっと帰りを待っていました！
						</h1>
						<p className="mt-4 max-w-md text-base text-white/90">
							恥ずかしいからはっきり言わないの。あと、こっち見るのも禁止。目、つむってて。
						</p>
					</div>
					<p className="text-sm text-white/75">愛によってBuildされました。</p>
				</section>

				<section className="flex items-center justify-center px-6 py-12">
					<div className="w-full max-w-[440px] rounded-3xl border border-[var(--border-subtle)] bg-white p-8 shadow-[0_24px_70px_-40px_rgba(15,20,25,0.45)] sm:p-10">
						<p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-500">
							おかえりなさい
						</p>
						<h1 className="mt-3 text-3xl font-extrabold text-[var(--text-main)]">
							ログイン
						</h1>

						{requiresTwoFactor ? (
							<form onSubmit={handleVerifyTotp} className="mt-8 space-y-4">
								<p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
									2段階認証コードを入力してください
								</p>
								<div className="space-y-2">
									<label
										className="text-sm font-bold text-[var(--text-subtle)]"
										htmlFor="totp"
									>
										Authenticator code
									</label>
									<input
										id="totp"
										inputMode="numeric"
										autoComplete="one-time-code"
										pattern="[0-9]*"
										required
										value={totpCode}
										onChange={(event) =>
											setTotpCode(
												event.target.value.replace(/\D/g, "").slice(0, 8),
											)
										}
										className="h-12 w-full rounded-2xl border border-[var(--border-subtle)] px-4 text-base text-[var(--text-main)] outline-none transition focus:border-sky-400"
									/>
								</div>

								<button
									type="submit"
									disabled={isLoading}
									className="h-12 w-full rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
								>
									{isLoading ? "認証中..." : "コードを確認"}
								</button>
							</form>
						) : (
							<form onSubmit={handleSubmit} className="mt-8 space-y-4">
								<div className="space-y-2">
									<label
										className="text-sm font-bold text-[var(--text-subtle)]"
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
										className="h-12 w-full rounded-2xl border border-[var(--border-subtle)] px-4 text-base text-[var(--text-main)] outline-none transition focus:border-sky-400"
									/>
								</div>

								<div className="space-y-2">
									<label
										className="text-sm font-bold text-[var(--text-subtle)]"
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
										className="h-12 w-full rounded-2xl border border-[var(--border-subtle)] px-4 text-base text-[var(--text-main)] outline-none transition focus:border-sky-400"
									/>
								</div>

								<button
									type="submit"
									disabled={isLoading}
									className="h-12 w-full rounded-full bg-[var(--brand-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
								>
									{isLoading ? "ログイン中..." : "ログイン"}
								</button>
							</form>
						)}

						{error ? (
							<p className="mt-4 text-sm text-rose-600">{error}</p>
						) : null}

						<p className="mt-6 text-sm text-[var(--text-subtle)]">
							おっと...初見さん?{" "}
							<Link
								href="/signup"
								className="font-bold text-[var(--brand-primary)]"
							>
								アカウントを作成
							</Link>
						</p>
					</div>
				</section>
			</div>
		</div>
	);
}
