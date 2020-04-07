import Koa from 'koa';
import serve from 'koa-static';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import {isEnabled as notificationsEnabled, handleSubscribe, handleUnsubscribe} from './notifications.js';
import {getEnabledFeatures} from './features.js';
import {handleCompany, addToQueue, findMatch} from './queue.js';
import forceHTTPS from 'koa-force-https';

const router = new Router();

const port = process.env.PORT || 3000;
const enforceHttps = process.env.FORCE_HTTPS && process.env.FORCE_HTTPS === 'true';

const app = new Koa();

router.get('/at/:companyName', handleCompany);
router.get('/api/features/enabled', getEnabledFeatures);
router.put('/api/queue', addToQueue);
router.post('/api/match/:queueId', findMatch);

if (notificationsEnabled()) {
	console.log('Notifications enabled')
	router.post('/api/notifications/subscribe', handleSubscribe);
	router.post('/api/notifications/unsubscribe', handleUnsubscribe);
}

if (enforceHttps) {
	console.log('Enforcing HTTPS');
	app.use(forceHTTPS());
}

app.use(bodyParser());

app.use(router.routes());

app.use(serve(process.cwd() + '/public'));

export function Server() {
	return {
		start: () => {
			app.listen(port, () => console.log(`watercoolerchat available on port ${port}`));
		},
		stop: () => {
			// Oh well...
			process.exit(0); // eslint-disable-line unicorn/no-process-exit
		}
	};
}

