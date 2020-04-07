import webpush from 'web-push';
import uuid from 'uuid';

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

export const isEnabled = () => {
	return (typeof privateKey !== 'undefined');
};

export const initialize = (store) => {
	datastore = store;
	datastore.initialize();
};

export const sendNotifications = async (filter, data) => {
	Object.values(datastore.getAllSubscriptions())
		.filter(subscription => (typeof subscription.endpoint !== 'undefined'))
		.filter(filter)
		.forEach(subscription => {
			webpush.sendNotification(
				subscription,
				data,
				notificationOptions
			)
				.catch(error => {
					console.log('Failed to push to one target');
					console.error(error);
				});
		});
};

const isValidSaveRequest = request => {
	return (typeof request.body !== 'undefined') &&
			(typeof request.body.subscription !== 'undefined') &&
			(typeof request.body.subscription.endpoint !== 'undefined') &&
			(typeof request.body.companyName !== 'undefined');
};

const saveSubscriptionToDatabase = (subscription, companyName) => {
	const subscriptionId = uuid.v4();
	console.log(`Registering new subscription: ${subscriptionId}`);
	datastore.addSubscription({subscriptionId, companyName, ...subscription});
	return subscriptionId;
};

const removeSubscriptionToDatabase = subscriptionId => {
	console.log(`Removing subscription: ${subscriptionId}`);
	datastore.removeSubscription(subscriptionId);
	return subscriptionId;
};

export const handleSubscribe = async ctx => {
	if (!isValidSaveRequest(ctx.request)) {
		ctx.throw(400, 'Unable to save subscription: The subscription did not contain all required fields.');
		return;
	}

	const subscriptionId = saveSubscriptionToDatabase(ctx.request.body.subscription, ctx.request.body.companyName);

	if (subscriptionId) {
		ctx.response.type = 'json';
		ctx.response.body = JSON.stringify({data: {success: true, subscriptionId}});
	} else {
		ctx.throw(500, 'Unable to save subscription: The subscription was received but we were unable to save it to our database.');
	}
};

export const handleUnsubscribe = ctx => {
	if (typeof ctx.request.body === 'undefined' && typeof ctx.request.body.subscriptionId !== 'undefined') {
		ctx.throw(400, 'Unable to unsubscribe: subscriptionId required');
		return;
	}

	const subscriptionId = removeSubscriptionToDatabase(ctx.request.body.subscriptionId);

	if (subscriptionId) {
		ctx.response.type = 'json';
		ctx.response.body = JSON.stringify({data: {success: true, subscriptionId}});
	} else {
		ctx.throw(500, 'Unable to unsubscribe: The unsubscription was received but we were unable to remove it to our database.');
	}
};
