import uuid from 'uuid';
import {createReadStream} from 'fs';

const queue = {};

const QUEUE_STATE = Object.freeze({
	SEARCHING: 'searching',
	POTENTIAL_MATCH: 'potentialMatch',
	MATCH_ACKNOWLEDGED: 'matchAcknowledged',
	FOUND: 'found'
});

const MAX_TIME_WAITING_ON_POTENTIAL_MATCH_IN_MS = 11 * 1000;

export const handleCompany = async ctx => {
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

export const addToQueue = async ctx => {
	const {userName, companyName, subscriptionId} = ctx.request.body;
	const queueItem = QueueItem({userName, companyName, subscriptionId}); // eslint-disable-line new-cap
	const {queueId} = queueItem;

	queue[queueId] = queueItem;

	logState();

	ctx.response.type = 'json';
	ctx.response.body = JSON.stringify({queueId, userName, companyName});
};

const isValidMatchFor = me => potentialChatPartner =>
	potentialChatPartner.companyName === me.companyName &&
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
	const myQueueId = ctx.params.queueId;
	if (!Object.prototype.hasOwnProperty.call(queue, myQueueId)) {
		ctx.throw(400, 'queueId unknown');
	}

	const me = queue[myQueueId];

	let resultState = QUEUE_STATE.SEARCHING;

	switch (me.state) {
		case QUEUE_STATE.SEARCHING: {
			const potentialChatPartner = findChatPartner(me);

			if (potentialChatPartner) {
				matchChatPartners(me, potentialChatPartner);
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
				} else if (Date.now() > me.potentialMatchStartDate + MAX_TIME_WAITING_ON_POTENTIAL_MATCH_IN_MS) {
					// Our match did not acknowledge, go back to searching.
					matchFailed(me, chatPartner);
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
		chatUrl: me.chatUrl,
		chatPartner: me.chatPartnerName
	});
};