'use strict';

import {getCompanyNameFromUrl} from './utils.js';

const appServerPublicKey = 'BKHcfZBeFKoeKhkgC1L9qbnG-1zrMymK-AuMSlqvgLgLnbKHpVy5hHNFCcwIWnagUvoaXWgNnjoQJnIN6-i0i5E';

const companyName = getCompanyNameFromUrl();

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

const appServerKey = urlB64ToUint8Array(appServerPublicKey);

const sendUnsubscribeToBackEnd = async subscriptionId => {
	const response = await fetch('/api/notifications/unsubscribe', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			subscriptionId,
			companyName
		})
	});
	if (!response.ok) {
		throw new Error('Bad status code from server.');
	}

	const responseData = await response.json();
	if (!(responseData.data && responseData.data.success)) {
		throw new Error('Bad response from server.');
	}

	return responseData;
};

const sendSubscriptionToBackEnd = async (subscriptionId, subscription) => {
	const response = await fetch('/api/notifications/subscribe', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			subscriptionId,
			subscription,
			companyName
		})
	});
	if (!response.ok) {
		throw new Error('Bad status code from server.');
	}

	const responseData = await response.json();
	if (!(responseData.data && responseData.data.success)) {
		throw new Error('Bad response from server.');
	}

	return responseData.data.subscriptionId;
};

Vue.component('notifications-button', { // eslint-disable-line no-undef
	data() {
		return {
			swRegistration: null,
			label: 'Notify me when somebody is at the online watercooler',
			disabled: false,
			subscribed: false,
			subscription: null,
			subscriptionId: null
		};
	},
	mounted() {
		if (localStorage.subscriptionId) {
			this.subscriptionId = localStorage.subscriptionId;
		}
	},
	watch: {
		subscriptionId(newSubscriptionId) {
			localStorage.subscriptionId = newSubscriptionId;
		}
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
		async subscribeUser() {
			try {
				if (this.subscription === null) {
					this.subscription = await this.swRegistration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: appServerKey
					});
				}

				const id = await sendSubscriptionToBackEnd(this.subscriptionId, this.subscription);
				console.log(`Registered subscription: ${id}`);
				this.subscriptionId = id;
				this.subscribed = true;
				this.updateButton();
			} catch (error) {
				console.log('Failed to subscribe the user:', error);
				this.updateButton();
			}
		},
		async unsubscribeUser() {
			try {
				const unsubscription = await sendUnsubscribeToBackEnd(this.subscriptionId);
				if (unsubscription.removeSubscription && this.subscription) {
					console.log('Removing subscription');
					await this.subscription.unsubscribe();
				}

				console.log(`Removing subscription: ${this.subscriptionId}`);
			} catch (error) {
				console.log('Error unsubscribing', error);
			}

			this.subscribed = false;
			this.updateButton();
		},
		async updateButton() {
			if (Notification.permission === 'denied') {
				this.label = 'Notification blocked, please allow us to send your browser notifications';
				this.subscribed = false;
				this.disabled = true;

				if (this.subscriptionId) {
					await sendUnsubscribeToBackEnd(this.subscriptionId);
					this.subscriptionId = null;
				}

				return;
			}

			this.disabled = false;
		}
	},
	async created() {
		if ('serviceWorker' in navigator && 'PushManager' in window) {
			console.log('Service Worker and Push is supported');

			try {
				const swReg = await navigator.serviceWorker.register('/sw.js');
				console.log('Service Worker is registered', swReg);
				this.swRegistration = swReg;

				// Set the initial subscription value
				this.subscription = await this.swRegistration.pushManager.getSubscription();
				if (this.subscription !== null && this.subscriptionId !== null) {
					const response = await fetch(`/api/notifications/${this.subscriptionId}`);
					if (response.status >= 200 && response.status < 300) {
						const json = await response.json();
						this.subscribed = (json && json.validFor && json.validFor.includes(companyName));
					}
				}

				this.updateButton();
			}	catch (error) {
				console.error('Service Worker Error', error);
			}
		} else {
			console.warn('Push messaging is not supported');
			this.label = 'Notifications not supported';
		}
	},
	template: '<button id="notificationsbutton" class="notificationsmessage" v-on:click="toggleNotifications" :disabled="disabled"><input type="checkbox" id="notificationsenabled" v-model="subscribed"> <label id="notificationslabel" for="notificationsEnabled">{{ label }}</label></button>'
});
