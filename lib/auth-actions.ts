"use client";

import { authClient } from "@/lib/auth-client";

type AuthResult = {
	success: boolean;
	error?: string;
};

export async function signInWithEmail(params: {
	email: string;
	password: string;
}): Promise<AuthResult> {
	const { error } = await authClient.signIn.email({
		email: params.email,
		password: params.password,
	});

	if (error) {
		return { success: false, error: error.message };
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

export async function signOut(): Promise<void> {
	await authClient.signOut();
}
