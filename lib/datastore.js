export const inMemoryDatastore = {
	_subscriptionCache: {},
	initialize() {
		// Already initialized the cache
	},
	getAllSubscriptions() {
		return Object.values(this._subscriptionCache);
	},
	addSubscription(subscription) {
		this._subscriptionCache[subscription.subscriptionId] = subscription;
	},
	removeSubscription(subscriptionId) {
		delete this._subscriptionCache[subscriptionId];
	}
};
