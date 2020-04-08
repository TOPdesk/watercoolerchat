import uuid from 'uuid';
import {createReadStream} from 'fs';
import {isEnabled as notificationsEnabled, sendNotifications} from './notifications.js';
import {incrementMetric, measureMetric} from './metrics.js';

const queue = {};

const QUEUE_STATE = Object.freeze({
	SEARCHING: 'searching',
	POTENTIAL_MATCH: 'potentialMatch',
	MATCH_ACKNOWLEDGED: 'matchAcknowledged',
	FOUND: 'found'
});

const MAX_TIME_WAITING_ON_POTENTIAL_MATCH_IN_MS = 11 * 1000;
const MINIMUM_TIME_BETWEEN_NOTIFICATIONS_IN_MS = 5 * 60 * 1000;
const lastNotificationSent = {};

export const handleCompany = async ctx => {
	const {companyName} = ctx.params;
	if (!companyName) {
		ctx.throw(400, 'companyName empty');
	}

	incrementMetric('visits.companyPage');
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

const QueueItem = ({
	queueId = uuid.v4(),
	state = QUEUE_STATE.SEARCHING,
	initialRequestDate = Date.now(),
	lastRequestDate = Date.now(),
	potentialMatchStartDate = null,
	userName,
	companyName,
	subscriptionId = null,
	chatPartnerId = null,
	chatPartnerName = null,
	chatUrl = null,
	failedMatches = []
} = {}) => ({
	queueId, state, initialRequestDate, lastRequestDate, potentialMatchStartDate, userName,
	companyName, subscriptionId, chatPartnerId, chatPartnerName, chatUrl, failedMatches
});

const companyEquals = (a, b) => {
	return typeof a === 'string' && typeof b === 'string'
		? a.localeCompare(b, undefined, {sensitivity: 'base'}) === 0
		: a === b;
};

const notificationFilter = (companyName, mySubscriptionId) => {
	return subscription => {
		return subscription.companyNames.some(name => companyEquals(name, companyName)) &&
			subscription.subscriptionId !== mySubscriptionId;
	};
};

const sendNotificationsForQueueItem = queueItem => {
	if (!notificationsEnabled()) {
		return;
	}

	const {companyName} = queueItem;
	if (!lastNotificationSent[companyName] || lastNotificationSent[companyName] + MINIMUM_TIME_BETWEEN_NOTIFICATIONS_IN_MS < Date.now()) {
		lastNotificationSent[companyName] = Date.now();
		console.log(`Sending notifications for ${companyName}`);
		sendNotifications(notificationFilter(companyName, queueItem.subscriptionId), JSON.stringify({
			message: `Someone is looking for a chat at the watercooler at ${companyName}! Click here to go to the online watercooler.`,
			companyName
		}));
	} else {
		console.log(`Holding notifications for ${companyName}, now ${Date.now()} is not past ${lastNotificationSent[companyName] + MINIMUM_TIME_BETWEEN_NOTIFICATIONS_IN_MS}`);
		incrementMetric('notifications.holded');
	}
};

export const addToQueue = async ctx => {
	incrementMetric('queue.entered');
	const {userName, companyName, subscriptionId} = ctx.request.body;
	const queueItem = QueueItem({userName, companyName, subscriptionId}); // eslint-disable-line new-cap
	const {queueId} = queueItem;

	queue[queueId] = queueItem;

	sendNotificationsForQueueItem(queueItem);
	logState();

	ctx.response.type = 'json';
	ctx.response.body = JSON.stringify({queueId, userName, companyName});
};

export function Queue() {
	return {
		add: ({userName, companyName, subscriptionId}) => {
			const queueItem = QueueItem({userName, companyName, subscriptionId}); // eslint-disable-line new-cap
			const {queueId} = queueItem;

			queue[queueId] = queueItem;

			sendNotificationsForQueueItem(queueItem);
			logState();

			return {queueId, userName, companyName};
		}
	};
}

const isValidMatchFor = me => potentialChatPartner =>
	companyEquals(potentialChatPartner.companyName, me.companyName) &&
	potentialChatPartner.state !== QUEUE_STATE.FOUND &&
	potentialChatPartner.queueId !== me.queueId &&
	!me.failedMatches.includes(potentialChatPartner.queueId);

const findChatPartner = me => Object.values(queue)
	.filter(isValidMatchFor(me))[0];

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

export const findMatch = async ctx => {
	incrementMetric('queue.matches.searching');
	const myQueueId = ctx.params.queueId;
	if (!Object.prototype.hasOwnProperty.call(queue, myQueueId)) {
		ctx.throw(400, 'queueId unknown');
	}

	const me = queue[myQueueId];
	me.lastRequestDate = Date.now();

	let resultState = QUEUE_STATE.SEARCHING;

	switch (me.state) {
		case QUEUE_STATE.SEARCHING: {
			const potentialChatPartner = findChatPartner(me);

			if (potentialChatPartner) {
				incrementMetric('queue.matches.potential');
				matchChatPartners(me, potentialChatPartner);
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
					incrementMetric('queue.matches.acknowledged');
					matchVerified(me, chatPartner);
				} else if (Date.now() > me.potentialMatchStartDate + MAX_TIME_WAITING_ON_POTENTIAL_MATCH_IN_MS) {
					// Our match did not acknowledge, go back to searching.
					incrementMetric('queue.matches.failed');
					matchFailed(me, chatPartner);
				}
			} else {
				me.state = QUEUE_STATE.SEARCHING;
			}

			break;
		}

		case QUEUE_STATE.FOUND: {
			resultState = QUEUE_STATE.FOUND;
			measureMetric('queue.times.successfulmatch', `${me.lastRequestDate - me.initialRequestDate}ms`);
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
		chatUrl: me.chatUrl,
		chatPartner: me.chatPartnerName
	});
};
