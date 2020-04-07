'use strict';

const appServerPublicKey = 'BKHcfZBeFKoeKhkgC1L9qbnG-1zrMymK-AuMSlqvgLgLnbKHpVy5hHNFCcwIWnagUvoaXWgNnjoQJnIN6-i0i5E';

const url = window.location.href.replace(/\/$/, '');
const companyName = url.slice(url.lastIndexOf('/') + 1);

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

Vue.component('notifications-button', { // eslint-disable-line no-undef
	data() {
		return {
			swRegistration: null,
			label: 'Notify me when somebody is at the online watercooler',
			disabled: false,
			subscribed: false
		};
	},
	methods: {
		toggleNotifications() {
			this.disabled = true;
			if (this.subscribed) {
				this.unsubscribeUser();
			} else {
				this.subscribeUser();
			}
		},
		subscribeUser() {
			const appServerKey = urlB64ToUint8Array(appServerPublicKey);

			this.swRegistration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: appServerKey
			})
				.then(subscription => {
					updateSubscriptionOnServer(subscription);
					this.subscribed = true;
					this.updateButton();
				})
				.catch(error => {
					console.log('Failed to subscribe the user:', error);
					this.updateButton();
				});
		},
		unsubscribeUser() {
			this.swRegistration.pushManager.getSubscription()
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
					this.subscribed = false;
					this.updateButton();
				});
		},
		updateButton() {
			if (Notification.permission === 'denied') {
				this.label = 'Notification blocked, please allow us to send your browser notifications';
				this.subscribed = false;
				this.disabled = true;
				updateSubscriptionOnServer(null);
				return;
			}

			this.disabled = false;
		}
	},
	created() {
		if ('serviceWorker' in navigator && 'PushManager' in window) {
			console.log('Service Worker and Push is supported');

			navigator.serviceWorker.register('/sw.js')
				.then(swReg => {
					console.log('Service Worker is registered', swReg);
					this.swRegistration = swReg;

					// Set the initial subscription value
					this.swRegistration.pushManager.getSubscription().then(subscription => {
						this.subscribed = !(subscription === null);

						if (this.subscribed) {
							console.log('User IS subscribed.');
						} else {
							console.log('User is NOT subscribed.');
						}

						this.updateButton();
					});
				})
				.catch(error => {
					console.error('Service Worker Error', error);
				});
		} else {
			console.warn('Push messaging is not supported');
			this.label = 'Notifications not supported';
		}
	},
	template: '<button id="notificationsbutton" class="notificationsmessage" v-on:click="toggleNotifications" :disabled="disabled"><input type="checkbox" id="notificationsenabled" v-model="subscribed"> <label id="notificationslabel" for="notificationsEnabled">{{ label }}</label></button>'
});
