'use strict';

const appServerPublicKey = 'BKHcfZBeFKoeKhkgC1L9qbnG-1zrMymK-AuMSlqvgLgLnbKHpVy5hHNFCcwIWnagUvoaXWgNnjoQJnIN6-i0i5E';

const url = window.location.href.replace(/\/$/, '');
const companyName = url.slice(url.lastIndexOf('/') + 1);

const pushButton = document.querySelector('.js-push-btn');
const checkbox = document.querySelector('#notificationsEnabled');

let isSubscribed = false;
let swRegistration = null;

const urlB64ToUint8Array = base64String => {
	const padding = '='.repeat((4 - base64String.length % 4) % 4); // eslint-disable-line no-mixed-operators
	const base64 = (base64String + padding)
		.replace(/-/g, '+')
		.replace(/_/g, '/');

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}

	return outputArray;
};

const updateSubscriptionOnServer = async subscription => {
	const subscriptionId = localStorage.getItem('subscriptionId');
	if (subscription !== null) {
		await sendSubscriptionToBackEnd(subscription);
	} else if (subscriptionId !== null) {
		console.log(`Removing subscription: ${subscriptionId}`);
		await sendUnsubscribeToBackEnd(subscriptionId);
		localStorage.removeItem('subscriptionId');
	}
};

const subscribeUser = () => {
	const appServerKey = urlB64ToUint8Array(appServerPublicKey);

	swRegistration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: appServerKey
	})
		.then(subscription => {
			updateSubscriptionOnServer(subscription);
			isSubscribed = true;
			updateButton();
		})
		.catch(error => {
			console.log('Failed to subscribe the user:', error);
			updateButton();
		});
};

const unsubscribeUser = () => {
	swRegistration.pushManager.getSubscription()
		.then(subscription => {
			if (subscription) {
				return subscription.unsubscribe();
			}
		})
		.catch(error => {
			console.log('Error unsubscribing', error);
		})
		.then(() => {
			updateSubscriptionOnServer(null);
			isSubscribed = false;
			updateButton();
		});
};

const sendSubscriptionToBackEnd = async subscription => {
	return fetch('/api/notifications/subscribe', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			subscription,
			companyName
		})
	})
		.then(async response => {
			if (!response.ok) {
				throw new Error('Bad status code from server.');
			}

			const result = await response.json();
			const id = result.data.subscriptionId;
			console.log(`Registered subscription: ${id}`);
			localStorage.setItem('subscriptionId', id);
			return result;
		})
		.then(responseData => {
			if (!(responseData.data && responseData.data.success)) {
				throw new Error('Bad response from server.');
			}
		});
};

const sendUnsubscribeToBackEnd = subscriptionId => {
	return fetch('/api/notifications/unsubscribe', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			subscriptionId
		})
	})
		.then(response => {
			if (!response.ok) {
				throw new Error('Bad status code from server.');
			}

			return response.json();
		})
		.then(responseData => {
			if (!(responseData.data && responseData.data.success)) {
				throw new Error('Bad response from server.');
			}
		});
};

const initializeUI = () => {
	pushButton.addEventListener('click', () => {
		pushButton.disabled = true;
		if (isSubscribed) {
			unsubscribeUser();
		} else {
			subscribeUser();
		}
	});

	// Set the initial subscription value
	swRegistration.pushManager.getSubscription()
		.then(subscription => {
			isSubscribed = !(subscription === null);

			if (isSubscribed) {
				console.log('User IS subscribed.');
			} else {
				console.log('User is NOT subscribed.');
			}

			updateButton();
		});
};

const updateButton = () => {
	if (Notification.permission === 'denied') {
		pushButton.textContent = 'BLOCKED';
		pushButton.disabled = true;
		updateSubscriptionOnServer(null);
		return;
	}

	if (isSubscribed) {
		checkbox.checked = true;
	} else {
		checkbox.checked = false;
	}

	pushButton.disabled = false;
};

if ('serviceWorker' in navigator && 'PushManager' in window) {
	console.log('Service Worker and Push is supported');

	navigator.serviceWorker.register('/sw.js')
		.then(swReg => {
			console.log('Service Worker is registered', swReg);
			swRegistration = swReg;
			initializeUI();
		})
		.catch(error => {
			console.error('Service Worker Error', error);
		});
} else {
	console.warn('Push messaging is not supported');
	pushButton.textContent = 'Not supported';
}
