import uuid from 'uuid';
import {createReadStream} from 'fs';
import {isEnabled as notificationsEnabled, sendNotifications} from './notifications.js';
import {incrementMetric, measureMetric} from './metrics.js';

let datastore;

const queue = {};
const chatGroups = {};

const QUEUE_STATE = Object.freeze({
	STARTING_SEARCH: 'startingSearch',
	WAITING_FOR_GROUP_TO_FILL: 'waitingForGroupToFill',
	GROUP_FULL: 'groupFull'
});

const MAX_GROUP_SIZE = 6;
const MIN_GROUP_SIZE = 3;
const MAX_TIME_TO_WAIT_FOR_REACHING_MAX_SIZE = 3 * 60 * 1000;
const MAX_TIMEOUT_BEFORE_MARKING_AS_INACTIVE = 11 * 1000;
const MINIMUM_TIME_BETWEEN_NOTIFICATIONS_IN_MS = 5 * 60 * 1000;
const lastNotificationSent = {};

export const initialize = store => {
	datastore = store;
	datastore.initialize();
};

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
	lastMemberAddedDate = Date.now(),
	minimumMembersReachedDate = new Date(8640000000000000),
	members = [],
	chatStarted = false
} = {}) => ({
	chatGroupId, companyName, chatUrl, lastMemberAddedDate, minimumMembersReachedDate, members, chatStarted
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

const generateMicrosoftTeamsUrl = async () => {
	const teamsRooms = await datastore.getAllTeamsRooms();
	if (teamsRooms.length === 0) {
		return generateTalkyUrl('TOPdesk');
	}

	const teamsRoom = teamsRooms[Math.floor(Math.random() * teamsRooms.length)];
	datastore.removeTeamsRoom(teamsRoom._id);
	return teamsRoom.url;
};

const createNewChatGroup = async companyName => {
	const chatGroup = ChatGroup({companyName, chatUrl: await generateMicrosoftTeamsUrl()}); // eslint-disable-line new-cap
	const {chatGroupId} = chatGroup;

	chatGroups[chatGroupId] = chatGroup;

	return chatGroup;
};

const addToChatGroup = (chatGroup, me) => {
	chatGroup.members.push(me);
	chatGroup.lastMemberAddedDate = Date.now();
	if (chatGroup.members.length === MIN_GROUP_SIZE) {
		chatGroup.minimumMembersReachedDate = Date.now();
	}

	me.chatGroupId = chatGroup.chatGroupId;
};

const isFull = chatGroup => {
	purgeInactiveMembers(chatGroup);
	if (chatGroup.members.length >= MAX_GROUP_SIZE) {
		console.log(`Chatgroup ${chatGroup.chatGroupId} has ${MAX_GROUP_SIZE} members and is full. Starting chat in ${chatGroup.chatUrl}`);
		incrementMetric('queue.groups.startchat.full');
		return true;
	}

	if (chatGroup.members.length >= MIN_GROUP_SIZE && chatGroup.minimumMembersReachedDate + MAX_TIME_TO_WAIT_FOR_REACHING_MAX_SIZE < Date.now()) {
		console.log(`Chatgroup ${chatGroup.chatGroupId} is not yet full, but has had at least ${MIN_GROUP_SIZE} members for ${MAX_TIME_TO_WAIT_FOR_REACHING_MAX_SIZE / 1000} seconds. Starting chat in ${chatGroup.chatUrl}`);
		incrementMetric('queue.groups.startchat.notfull');
		return true;
	}

	return false;
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

	const result = await _findMatch(myQueueId);

	ctx.response.body = JSON.stringify(result);
};

const _findMatch = async myQueueId => {
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
				const newChatGroup = await createNewChatGroup(me.companyName);
				addToChatGroup(newChatGroup, me);
			}

			me.state = QUEUE_STATE.WAITING_FOR_GROUP_TO_FILL;
			break;
		}

		case QUEUE_STATE.WAITING_FOR_GROUP_TO_FILL: {
			const myChatGroup = chatGroups[me.chatGroupId];
			if (myChatGroup.chatStarted || isFull(myChatGroup)) {
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
};
