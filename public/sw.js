self.addEventListener('push', event => {
	console.log('[Service Worker] Push Received.');
	console.log(`[Service Worker] Push had this data: "${event.data.text()}"`);

	const title = 'Watercooler chat';
	const options = {
		body: event.data.text(),
		icon: 'watercoolerchat.svg'
	};

	event.waitUntil(self.registration.showNotification(title, options));
});
