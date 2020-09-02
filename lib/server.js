import Koa from 'koa';
import serve from 'koa-static';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import {isEnabled as notificationsEnabled, initialize as initializeNotifications, handleGet, handleSubscribe, handleUnsubscribe} from './notifications.js';
import {getDatastore} from './datastore.js';
import {getEnabledFeatures} from './features.js';
import {initialize as initializeQueue, handleCompany, addToQueue, findMatch} from './queue.js';

const router = new Router();

const app = new Koa();
const datastore = getDatastore();
console.log('INITDATASTORE');

router.get('/at/:companyName', handleCompany);
router.get('/api/features/enabled', getEnabledFeatures);
router.put('/api/queue', addToQueue);
router.post('/api/match/:queueId', findMatch);

initializeQueue(datastore);
console.log('INITQUEUE');

if (notificationsEnabled()) {
	initializeNotifications(datastore);
	console.log('INITNOTIFICATIONS');
	router.get('/api/notifications/:subscriptionId', handleGet);
	router.post('/api/notifications/subscribe', handleSubscribe);
	router.post('/api/notifications/unsubscribe', handleUnsubscribe);
}

app.use(bodyParser());

app.use(router.routes());

app.use(serve(process.cwd() + '/public'));

export function Server() {
	return {
		start: (port = 3000) => {
			app.listen(port, () => console.log(`watercoolerchat available on port ${port}`));
		},
		stop: () => {
			datastore.close();
			// Oh well...
			process.exit(0); // eslint-disable-line unicorn/no-process-exit
		}
	};
}

