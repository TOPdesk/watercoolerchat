self.addEventListener('push', event => {
	console.log('[Service Worker] Push Received.');
	console.log(`[Service Worker] Push had this data: "${event.data.text()}"`);

	const title = 'Watercooler chat';
	const {message, companyName} = JSON.parse(event.data.text());
	const options = {
		body: message,
		data: {
			companyName
		},
		icon: 'notification-icon.png'
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
	const {notification, action} = event;
	const {companyName} = notification.data;

	if (action === 'close') {
		notification.close();
	} else {
		clients.openWindow(`https://have-a.watercoolerchat.online/at/${companyName}`); // eslint-disable-line no-undef
		notification.close();
	}
});
