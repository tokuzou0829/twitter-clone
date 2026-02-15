import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

export function useNotificationManager() {
	const { data: session } = authClient.useSession();
	const [isSupported, setIsSupported] = useState(false);
	const [subscription, setSubscription] = useState<PushSubscription | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	const syncSubscription = useCallback(
		async (sub: PushSubscription) => {
			if (!session) return;
			const payload = sub.toJSON();
			if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
				throw new Error("通知の購読情報が不正です");
			}

			const response = await apiClient.api.notifications.subscriptions.$post({
				json: {
					endpoint: payload.endpoint,
					expirationTime: payload.expirationTime ?? null,
					keys: {
						p256dh: payload.keys.p256dh,
						auth: payload.keys.auth,
					},
				},
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(body?.error ?? "通知の購読情報の同期に失敗しました");
			}
		},
		[session],
	);

	// Service Workerの登録
	const registerServiceWorker = useCallback(async () => {
		try {
			const registration = await navigator.serviceWorker.register("/sw.js", {
				scope: "/",
				updateViaCache: "none",
			});
			const sub = await registration.pushManager.getSubscription();
			setSubscription(sub);
		} catch (error) {
			if (error instanceof Error) {
				setError(error.message);
			}
		}
	}, []);

	useEffect(() => {
		if ("serviceWorker" in navigator && "PushManager" in window) {
			setIsSupported(true);
			void registerServiceWorker();
		}
	}, [registerServiceWorker]);

	useEffect(() => {
		if (!session || !subscription) return;
		void syncSubscription(subscription).catch((error) => {
			if (error instanceof Error) {
				setError(error.message);
			}
		});
	}, [session, subscription, syncSubscription]);

	// Base64文字列をUint8Arrayに変換
	function urlBase64ToUint8Array(base64String: string) {
		const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding)
			.replace(/-/g, "+")
			.replace(/_/g, "/");

		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);

		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray;
	}

	// 通知の購読
	const subscribeToPush = async () => {
		try {
			if (!session) {
				throw new Error("ログインしてから通知を許可してください");
			}

			// 通知許可を要求
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				throw new Error("通知の許可が得られませんでした");
			}

			const registration = await navigator.serviceWorker.ready;
			const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
			if (!publicKey) {
				throw new Error("VAPID公開鍵が設定されていません");
			}

			const sub = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey),
			});
			setSubscription(sub);
			await syncSubscription(sub);
		} catch (error) {
			if (error instanceof Error) {
				setError(error.message);
			}
		}
	};

	// 通知の購読解除
	const unsubscribeFromPush = async () => {
		try {
			if (!subscription) return;
			const endpoint = subscription.endpoint;
			await subscription.unsubscribe();
			setSubscription(null);
			if (session && endpoint) {
				const response =
					await apiClient.api.notifications.subscriptions.$delete({
						query: { endpoint },
					});
				if (!response.ok) {
					const body = (await response.json().catch(() => null)) as {
						error?: string;
					} | null;
					throw new Error(body?.error ?? "通知の購読解除に失敗しました");
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				setError(error.message);
			}
		}
	};

	const getSubscriptionStatus = useCallback(async () => {
		try {
			if (!session || !isSupported) {
				return false;
			}

			const registration = await navigator.serviceWorker.ready;
			const sub = await registration.pushManager.getSubscription();
			if (!sub) {
				return false;
			}

			const response = await apiClient.api.notifications.subscriptions.$get({
				query: { endpoint: sub.endpoint },
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(body?.error ?? "通知の購読状態を取得できません");
			}

			const body = (await response.json()) as { subscribed: boolean };
			return body.subscribed;
		} catch (error) {
			if (error instanceof Error) {
				setError(error.message);
			}
			return false;
		}
	}, [isSupported, session]);

	// 通知の送信
	const sendNotification = async (message: string) => {
		try {
			if (!subscription) {
				return false;
			}

			const response = await fetch("/api/send-notification", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message,
					subscription,
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || "通知の送信に失敗しました");
			}

			return true;
		} catch (error) {
			if (error instanceof Error) {
				setError(error.message);
			}
			return false;
		}
	};

	return {
		isSupported,
		subscription,
		error,
		subscribeToPush,
		unsubscribeFromPush,
		getSubscriptionStatus,
		sendNotification,
	};
}
