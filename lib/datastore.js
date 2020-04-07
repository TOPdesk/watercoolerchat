import mongodb from 'mongodb';

const url = process.env.MONGODB_URL;
const dbName = 'watercoolerchat';
const subscriptionCollection = 'subscriptions';

export const mongoDbDatastore = {
	_db: null,
	async initialize() {
		const {MongoClient} = mongodb;
		const client = new MongoClient(url, {
			numberOfRetries: 1000,
			useUnifiedTopology: true
		});
		await client.connect();
		this._db = client.db(dbName);
	},
	getAllSubscriptions() {
		return this._db.collection(subscriptionCollection).find({}).toArray();
	},
	addSubscription(subscription) {
		this._db.collection(subscriptionCollection).insertOne(subscription);
	},
	close() {
		if (this._db) {
			this._db.close();
		}
	},
	removeSubscription(subscriptionId) {
		this._db.collection(subscriptionCollection).deleteOne({subscriptionId});
	}
};

const inMemoryDatastore = {
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
	close() {
		// Nothing to clean up
	},
	removeSubscription(subscriptionId) {
		delete this._subscriptionCache[subscriptionId];
	}
};

export const getDatastore = () => {
	if (typeof url === 'undefined') {
		console.log('Using in memory datastore');
		return inMemoryDatastore;
	}

	console.log('Using mongodb datastore');
	return mongoDbDatastore;
};
