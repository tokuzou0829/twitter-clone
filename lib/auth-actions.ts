"use client";

import { authClient } from "@/lib/auth-client";

type AuthResult = {
	success: boolean;
	error?: string;
	requiresTwoFactor?: boolean;
};

type TwoFactorResult = {
	success: boolean;
	error?: string;
	totpURI?: string;
	backupCodes?: string[];
};

async function postAuthJson<T>(
	path: string,
	body: Record<string, unknown>,
): Promise<{ data?: T; error?: string }> {
	const response = await fetch(`/api/auth${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		credentials: "include",
		body: JSON.stringify(body),
	});

	const payload = (await response.json().catch(() => null)) as {
		message?: string;
	} | null;

	if (!response.ok) {
		return {
			error:
				typeof payload?.message === "string"
					? payload.message
					: `Request failed (${response.status})`,
		};
	}

	return { data: (payload ?? undefined) as T | undefined };
}

export async function signInWithEmail(params: {
	email: string;
	password: string;
}): Promise<AuthResult> {
	const { data, error } = await authClient.signIn.email({
		email: params.email,
		password: params.password,
	});

	if (error) {
		return { success: false, error: error.message };
	}

	if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
		return { success: false, requiresTwoFactor: true };
	}

	return { success: true };
}

export async function verifyTotpForSignIn(code: string): Promise<AuthResult> {
	const { error } = await postAuthJson<{ user: unknown; session: unknown }>(
		"/two-factor/verify-totp",
		{ code },
	);

	if (error) {
		return { success: false, error };
	}

	return { success: true };
}

export async function signUpWithEmail(params: {
	name: string;
	email: string;
	password: string;
}): Promise<AuthResult> {
	const { error } = await authClient.signUp.email({
		name: params.name,
		email: params.email,
		password: params.password,
	});

	if (error) {
		return { success: false, error: error.message };
	}

	return { success: true };
}

export async function enableTotp(params: {
	password: string;
	issuer?: string;
}): Promise<TwoFactorResult> {
	const { data, error } = await postAuthJson<{
		totpURI: string;
		backupCodes: string[];
	}>("/two-factor/enable", {
		password: params.password,
		issuer: params.issuer,
	});

	if (error) {
		return { success: false, error };
	}

	if (!data?.totpURI) {
		return { success: false, error: "TOTP設定の初期化に失敗しました" };
	}

	return {
		success: true,
		totpURI: data.totpURI,
		backupCodes: data.backupCodes ?? [],
	};
}

export async function verifyTotpEnrollment(code: string): Promise<AuthResult> {
	const { error } = await postAuthJson<{ status: boolean }>(
		"/two-factor/verify-totp",
		{ code },
	);

	if (error) {
		return { success: false, error };
	}

	return { success: true };
}

export async function disableTotp(password: string): Promise<AuthResult> {
	const { error } = await postAuthJson<{ status: boolean }>(
		"/two-factor/disable",
		{ password },
	);

	if (error) {
		return { success: false, error };
	}

	return { success: true };
}

export async function signOut(): Promise<void> {
	await authClient.signOut();
}
