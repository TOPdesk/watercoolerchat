import Koa from 'koa';
import send from 'koa-send';
import bodyParser from 'koa-bodyparser';
import Router from '@koa/router';
import uuid from 'uuid';
import {createReadStream} from 'fs';
import {handleSubscribe, handleUnsubscribe} from './notifications.js';

const router = new Router();

const port = process.env.PORT || 3000;

const app = new Koa();

const queue = {};

const QUEUE_STATE = {
	SEARCHING: 'searching',
	POTENTIAL_MATCH: 'potentialMatch',
	MATCH_ACKNOWLEDGED: 'matchAcknowledged',
	FOUND: 'found'
};

const MAX_TIME_WAITING_ON_POTENTIAL_MATCH_SECONDS = 11;

const handleCompany = async ctx => {
	const {companyName} = ctx.params;
	if (!companyName) {
		ctx.throw(400, 'companyName empty');
	}

	ctx.type = 'html';
	ctx.body = createReadStream('public/company.html');
};

const logState = () => {
	console.log('Queue:');
	console.log(queue);
	console.log('Matches:');
	console.log(Object.values(queue).filter(it => it.state === QUEUE_STATE.FOUND));
	console.log('\n\n');
};

const addToQueue = async ctx => {
	const {userName} = ctx.request.body;
	const {companyName} = ctx.request.body;
	const queueId = uuid.v4();

	queue[queueId] = {
		queueId,
		state: QUEUE_STATE.SEARCHING,
		initialRequestDate: Date.now(),
		lastRequestDate: Date.now(),
		potentialMatchStartDate: null,
		userName,
		companyName,
		chatPartnerId: null,
		chatPartnerName: null,
		chatUrl: null,
		failedMatches: []
	};

	logState();

	ctx.response.type = 'json';
	ctx.response.body = JSON.stringify({queueId, userName, companyName});
};

const findChatPartner = (companyName, queueId, failedMatches) => {
	const potentialChatPartners = Object.values(queue).filter(potentialChatPartner =>
		potentialChatPartner.companyName === companyName &&
		potentialChatPartner.state !== QUEUE_STATE.FOUND &&
		potentialChatPartner.queueId !== queueId &&
		!failedMatches.includes(potentialChatPartner.queueId));
	if (potentialChatPartners.length === 0) {
		return null;
	}

	return potentialChatPartners[0];
};

const generateTalkyUrl = companyName => {
	return `https://talky.io/${companyName}-${uuid.v4().slice(0, 8)}`;
};

const addChatPartner = (partner1, partner2, state, chatUrl) => {
	partner1.state = state;
	partner1.chatPartnerId = partner2.queueId;
	partner1.chatPartnerName = partner2.userName;
	partner1.chatUrl = chatUrl;
	partner1.potentialMatchStartDate = Date.now();
};

const matchChatPartners = (partner1, partner2) => {
	const chatUrl = generateTalkyUrl(partner1.companyName);
	addChatPartner(partner1, partner2, QUEUE_STATE.MATCH_ACKNOWLEDGED, chatUrl);
	addChatPartner(partner2, partner1, QUEUE_STATE.POTENTIAL_MATCH, chatUrl);
};

const matchVerified = (partner1, partner2) => {
	partner1.state = QUEUE_STATE.FOUND;
	partner2.state = QUEUE_STATE.FOUND;
};

const registerFailedMatch = (partner1, partner2Id) => {
	partner1.state = QUEUE_STATE.SEARCHING;
	partner1.chatPartnerId = null;
	partner1.chatPartnerName = null;
	partner1.chatUrl = null;
	partner1.potentialMatchStartDate = null;
	partner1.failedMatches.push(partner2Id);
};

const matchFailed = (partner1, partner2) => {
	registerFailedMatch(partner1, partner2.queueId);
	registerFailedMatch(partner2, partner1.queueId);
};

const findMatch = async ctx => {
	const myQueueId = ctx.params.queueId;
	if (!Object.prototype.hasOwnProperty.call(queue, myQueueId)) {
		ctx.throw(400, 'queueId unknown');
	}

	const me = queue[myQueueId];

	let resultState = QUEUE_STATE.SEARCHING;
	let resultChatUrl = me.chatUrl;
	let resultChatPartnerName = me.chatPartnerName;

	switch (me.state) {
		case QUEUE_STATE.SEARCHING: {
			const potentialChatPartner = findChatPartner(me.companyName, me.queueId, me.failedMatches);

			if (potentialChatPartner) {
				matchChatPartners(me, potentialChatPartner);

				resultState = QUEUE_STATE.SEARCHING;
				resultChatUrl = me.chatUrl;
				resultChatPartnerName = me.chatPartnerName;
			} else {
				me.lastRequestDate = Date.now();
			}

			break;
		}

		case QUEUE_STATE.POTENTIAL_MATCH: {
			me.state = QUEUE_STATE.MATCH_ACKNOWLEDGED;
			break;
		}

		case QUEUE_STATE.MATCH_ACKNOWLEDGED: {
			const chatPartner = queue[me.chatPartnerId];
			if (chatPartner) {
				if (chatPartner.state === QUEUE_STATE.MATCH_ACKNOWLEDGED) {
					matchVerified(me, chatPartner);
				} else if (Date.now() > me.potentialMatchStartDate + MAX_TIME_WAITING_ON_POTENTIAL_MATCH_SECONDS) {
					// Our match did not acknowledge, go back to searching.
					matchFailed(me, chatPartner);

					resultChatUrl = me.chatUrl;
					resultChatPartnerName = me.chatPartnerName;
				}
			} else {
				me.state = QUEUE_STATE.SEARCHING;
			}

			break;
		}

		case QUEUE_STATE.FOUND: {
			resultState = QUEUE_STATE.FOUND;
			delete queue[myQueueId];
			break;
		}

		default: {
			console.error(`Encountered unknown state ${me.state}`);
		}
	}

	logState();

	ctx.response.body = JSON.stringify({
		matchResult: resultState,
		chatUrl: resultChatUrl,
		chatPartner: resultChatPartnerName
	});
};

router.get('/at/:companyName', handleCompany);
router.put('/api/queue', addToQueue);
router.post('/api/match/:queueId', findMatch);
router.post('/api/notifications/subscribe', handleSubscribe);
router.post('/api/notifications/unsubscribe', handleUnsubscribe);

app.use(bodyParser());

app.use(async (ctx, next) => {
	const path = ctx.path === '/' ? '/index.html' : ctx.path;
	if (['/index.html', '/style.css', '/watercooler.svg', '/watercoolerchat.js', '/watercoolerchat-home.js', '/logo.png', '/favicon.ico'].includes(path)) {
		await send(ctx, path, {root: process.cwd() + '/public'});
	}

	await next();
});

app.use(router.routes());

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

