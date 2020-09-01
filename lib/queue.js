import uuid from 'uuid';
import {createReadStream} from 'fs';
import {isEnabled as notificationsEnabled, sendNotifications} from './notifications.js';
import {incrementMetric, measureMetric} from './metrics.js';

const queue = {};
const chatGroups = {};

const QUEUE_STATE = Object.freeze({
	STARTING_SEARCH: 'startingSearch',
	WAITING_FOR_GROUP_TO_FILL: 'waitingForGroupToFill',
	GROUP_FULL: 'groupFull'
});

const MAX_GROUP_SIZE = 3;
const MAX_TIMEOUT_BEFORE_MARKING_AS_INACTIVE = 11 * 1000;
const MINIMUM_TIME_BETWEEN_NOTIFICATIONS_IN_MS = 5 * 60 * 1000;
const lastNotificationSent = {};

export const handleCompany = async ctx => {
	const {companyName} = ctx.params;
	if (!companyName) {
		ctx.throw(400, 'companyName empty');
	}

	const {query} = ctx.request;
	if (query && query.ref && query.ref === 'notification') {
		incrementMetric('visits.fromnotification');
	}

	incrementMetric('visits.companypage');
	ctx.type = 'html';
	ctx.body = createReadStream('public/company.html');
};

const logState = () => {
	console.log('Queue:');
	console.log(queue);
	console.log('ChatGroups:');
	console.log(Object.values(chatGroups).map(it => Object.assign(it, {memberNames: it.members.map(member => member.userName)})));
	console.log('\n\n');
};

const ChatGroup = ({
	chatGroupId = uuid.v4(),
	companyName,
	chatUrl,
	members = [],
	chatStarted = false
} = {}) => ({
	chatGroupId, companyName, chatUrl, members, chatStarted
});

const QueueItem = ({
	queueId = uuid.v4(),
	state = QUEUE_STATE.STARTING_SEARCH,
	initialRequestDate = Date.now(),
	lastRequestDate = Date.now(),
	userName,
	companyName,
	subscriptionId = null,
	chatGroupId = null,
	chatUrl = null
} = {}) => ({
	queueId, state, initialRequestDate, lastRequestDate, userName,
	companyName, subscriptionId, chatGroupId, chatUrl
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
		},
		findMatch: _findMatch
	};
}

const isValidChatGroupFor = me => potentialChatGroup =>
	companyEquals(potentialChatGroup.companyName, me.companyName) &&
	potentialChatGroup.members.length < MAX_GROUP_SIZE;

const findChatGroup = me => Object.values(chatGroups)
	.filter(chatGroup => !chatGroup.chatStarted)
	.filter(isValidChatGroupFor(me))[0];

const generateTalkyUrl = companyName => {
	return `https://talky.io/${companyName}-${uuid.v4().slice(0, 8)}`;
};

const createNewChatGroup = companyName => {
	const chatGroup = ChatGroup({companyName, chatUrl: generateTalkyUrl(companyName)}); // eslint-disable-line new-cap
	const {chatGroupId} = chatGroup;

	chatGroups[chatGroupId] = chatGroup;

	return chatGroup;
};

const addToChatGroup = (chatGroup, me) => {
	chatGroup.members.push(me);
	me.chatGroupId = chatGroup.chatGroupId;
};

const isFull = chatGroup => {
	purgeInactiveMembers(chatGroup);
	return chatGroup.members.length >= MAX_GROUP_SIZE;
};

const purgeInactiveMembers = chatGroup => {
	const {members} = chatGroup;
	for (let i = members.length - 1; i >= 0; i--) {
		if (members[i].lastRequestDate + MAX_TIMEOUT_BEFORE_MARKING_AS_INACTIVE < Date.now()) {
			console.log(`${members[i].userName} is inactive in ${chatGroup.chatGroupId}, removing from the group`);
			queue[members[i].queueId].state = QUEUE_STATE.STARTING_SEARCH;
			queue[members[i].queueId].chatGroupId = null;
			members.splice(i, 1);
		}
	}
};

export const findMatch = async ctx => {
	const myQueueId = ctx.params.queueId;
	if (!Object.prototype.hasOwnProperty.call(queue, myQueueId)) {
		incrementMetric('queue.groups.searching');
		ctx.throw(400, 'queueId unknown');
	}

	const result = _findMatch(myQueueId);

	ctx.response.body = JSON.stringify(result);
};

function _findMatch(myQueueId) {
	incrementMetric('queue.groups.searching');

	if (!Object.prototype.hasOwnProperty.call(queue, myQueueId)) {
		return false;
	}

	const me = queue[myQueueId];
	me.lastRequestDate = Date.now();

	switch (me.state) {
		case QUEUE_STATE.STARTING_SEARCH: {
			const potentialChatGroup = findChatGroup(me);

			if (potentialChatGroup) {
				incrementMetric('queue.groups.potential');
				addToChatGroup(potentialChatGroup, me);
			} else {
				incrementMetric('queue.groups.new');
				const newChatGroup = createNewChatGroup(me.companyName);
				addToChatGroup(newChatGroup, me);
			}

			me.state = QUEUE_STATE.WAITING_FOR_GROUP_TO_FILL;
			break;
		}

		case QUEUE_STATE.WAITING_FOR_GROUP_TO_FILL: {
			const myChatGroup = chatGroups[me.chatGroupId];
			if (isFull(myChatGroup)) { // OR takes too long, then make smaller group?
				measureMetric('queue.times.successfulmatch', `${me.lastRequestDate - me.initialRequestDate}ms`);
				myChatGroup.chatStarted = true;
				me.state = QUEUE_STATE.GROUP_FULL;
				me.chatUrl = myChatGroup.chatUrl;
				me.chatPartners = myChatGroup.members.map(queueItem => queueItem.userName).join(', ');
				delete queue[me.queueId];
			}

			break;
		}

		default: {
			console.error(`Encountered unknown state ${me.state}`);
		}
	}

	logState();

	return {
		matchResult: me.state,
		chatUrl: me.chatUrl,
		chatPartners: me.chatPartners
	};
}
