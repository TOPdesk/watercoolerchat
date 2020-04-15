import webpush from 'web-push';
import uuid from 'uuid';
import {incrementMetric} from './metrics.js';

const privateKey = process.env.SW_PRIVATE_KEY;
const publicKey = process.env.SW_PUBLIC_KEY || 'BKHcfZBeFKoeKhkgC1L9qbnG-1zrMymK-AuMSlqvgLgLnbKHpVy5hHNFCcwIWnagUvoaXWgNnjoQJnIN6-i0i5E';

let datastore;

const notificationOptions = {
	vapidDetails: {
		subject: 'https://watercoolerchat.online/',
		publicKey,
		privateKey
	},
	TTL: 60 * 60
};

export function Notifications() {
	return {
		enabled: isEnabled,
		get: async subscriptionId => {
			const subscription = await datastore.getSubscription(subscriptionId);
			return Object.prototype.hasOwnProperty.call(subscription, 'companyNames')
				? {validFor: subscription.companyNames}
				: false;
		},
		subscribe: async ({subscriptionId, subscription, companyName}) => {
			const id = await saveSubscriptionToDatabase(subscriptionId, subscription, companyName);
			if (id) {
				return {data: {success: true, subscriptionId: id}};
			}

			return false;
		},
		unsubscribe: async ({subscriptionId, companyName}) => {
			const companyNames = removeSubscriptionFromDatabase(subscriptionId, companyName);
			const removeSubscription = companyNames.length > 0;
			return {data: {success: true, subscriptionId, removeSubscription}};
		}
	};
}

export const isEnabled = () => {
	return (typeof privateKey !== 'undefined');
};

export const initialize = store => {
	datastore = store;
	datastore.initialize();
};

export const sendNotifications = async (filter, data) => {
	const subscriptions = await datastore.getAllSubscriptions();
	subscriptions
		.filter(subscription => (typeof subscription.endpoint !== 'undefined'))
		.filter(filter)
		.forEach(subscription => {
			incrementMetric('notifications.attempted');
			webpush.sendNotification(
				subscription,
				data,
				notificationOptions
			)
				.catch(error => {
					console.log('Failed to push to one target');
					console.error(error);
					incrementMetric('notifications.failures.failedpush');
				});
		});
};

const isValidSaveRequest = request => {
	return (typeof request.body !== 'undefined') &&
			(typeof request.body.subscription !== 'undefined') &&
			(typeof request.body.subscription.endpoint !== 'undefined') &&
			(typeof request.body.companyName !== 'undefined');
};

const saveSubscriptionToDatabase = async (subscriptionId, subscription, companyName) => {
	const subscriptionInStore = subscriptionId === null ? null : await datastore.getSubscription(subscriptionId);
	if (!subscriptionInStore) {
		const newSubscriptionId = uuid.v4();
		console.log(`Registering new subscription: ${newSubscriptionId}`);
		datastore.addSubscription({subscriptionId: newSubscriptionId, companyNames: [companyName], ...subscription});
		return newSubscriptionId;
	}

	console.log(`Appending existing subscription: ${subscriptionId}`);
	const companyNames = subscriptionInStore.companyNames || [];
	companyNames.push(companyName);
	datastore.updateSubscription({subscriptionId, companyNames, ...subscription});

	return subscriptionId;
};

const removeSubscriptionFromDatabase = async (subscriptionId, companyName) => {
	const subscription = await datastore.getSubscription(subscriptionId);
	if (subscription.companyNames && subscription.companyNames.length > 1) {
		console.log(`Removing company ${companyName} from subscription ${subscriptionId}`);
		subscription.companyNames.splice(subscription.companyNames.indexOf(companyName), 1);
		datastore.updateSubscription(subscription);
		return subscription.companyNames;
	}

	console.log(`Removing subscription: ${subscriptionId}`);
	datastore.removeSubscription(subscriptionId);

	return [];
};

export const handleGet = async ctx => {
	const {subscriptionId} = ctx.params;
	const subscription = await datastore.getSubscription(subscriptionId);
	if (!subscription) {
		ctx.throw(404);
		return;
	}

	ctx.response.type = 'json';
	ctx.response.body = JSON.stringify({validFor: subscription.companyNames});
};

export const handleSubscribe = async ctx => {
	if (!isValidSaveRequest(ctx.request)) {
		incrementMetric('notifications.failures.invalidsubscriberequest');
		ctx.throw(400, 'Unable to save subscription: The subscription did not contain all required fields.');
		return;
	}

	const {subscriptionId, subscription, companyName} = ctx.request.body;
	const id = await saveSubscriptionToDatabase(subscriptionId, subscription, companyName);

	if (id) {
		incrementMetric('notifications.subscriptions');
		ctx.response.type = 'json';
		ctx.response.body = JSON.stringify({data: {success: true, subscriptionId: id}});
	} else {
		incrementMetric('notifications.failures.notsavedtodatabase');
		ctx.throw(500, 'Unable to save subscription: The subscription was received but we were unable to save it to our database.');
	}
};

export const handleUnsubscribe = ctx => {
	if (typeof ctx.request.body === 'undefined' ||
		typeof ctx.request.body.subscriptionId === 'undefined' ||
		typeof ctx.request.body.companyName === 'undefined') {
		incrementMetric('notifications.failures.invalidunsubscriberequest');
		ctx.throw(400, 'Unable to unsubscribe: subscriptionId and companyName required');
		return;
	}

	const {subscriptionId, companyName} = ctx.request.body;
	try {
		const companyNames = removeSubscriptionFromDatabase(subscriptionId, companyName);
		const removeSubscription = companyNames.length > 0;
		incrementMetric('notifications.unsubscriptions');
		ctx.response.type = 'json';
		ctx.response.body = JSON.stringify({data: {success: true, subscriptionId, removeSubscription}});
	} catch (error) {
		incrementMetric('notifications.failures.notremovedfromdatabase');
		console.log('Unable to unsubscribe', error);
		ctx.throw(500, 'Unable to unsubscribe: The unsubscription was received but we were unable to remove it to our database.');
	}
};
