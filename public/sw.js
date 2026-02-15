self.addEventListener("push", (event) => {
	if (event.data) {
		const data = event.data.json();
		const options = {
			body: data.body,
			icon: data.icon || "/icon.png",
			badge: "/badge.png",
			vibrate: [100, 50, 100],
			data: {
				url: data.url,
			},
		};

		event.waitUntil(self.registration.showNotification(data.title, options));
	}
});

self.addEventListener("notificationclick", (event) => {
	console.log("通知をクリックしました");
	event.notification.close();
	const targetUrl = event.notification.data?.url;
	if (targetUrl) {
		event.waitUntil(clients.openWindow(targetUrl));
	}
});
