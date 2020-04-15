import {Features} from '../features.js';
import {Queue} from '../queue.js';
import {Notifications} from '../notifications.js';
import {Method, Response, ContentType} from './httpconstants.js';
import {Metrics} from '../metrics.js';

const {'.js': Json} = ContentType;
const {NotFound, MethodNotAllowed, BadRequest, LengthRequired, UnsupportedMediaType, InternalServerError} = Response;
const {Get, Put, Post} = Method;

const NOT_COMPLETED = new Error('Not Completed');

export function ApiHandler({features = new Features(), queue = new Queue(), notifications = new Notifications(), metrics = new Metrics()} = {}) {
	return {
		handleRequest: (request, response) => handleRequest({features, queue, notifications, metrics}, request, response)
	};
}

async function handleRequest({features, queue, notifications, metrics}, request, response) {
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	if (pathname === '/api/features/enabled') {
		getFeatures(features, request, response);
		return;
	}

	if (pathname === '/api/queue') {
		addToQueue(queue, request, response);
		return;
	}

	if (pathname.startsWith('/api/match/')) {
		const id = pathname.slice('/api/match/'.length);
		findMatch(queue, id, request, response);
		return;
	}

	// Maybe POST /api/notifications and DELETE /api/notifications/:id is more RESTy
	if (notifications.enabled()) {
		if (pathname === '/api/notifications/subscribe') {
			subscribe(notifications, metrics, request, response);
			return;
		}

		if (pathname.startsWith('/api/notifications/unsubscribe')) {
			unsubscribe(notifications, metrics, request, response);
			return;
		}

		if (pathname.startsWith('/api/notifications/')) {
			const id = pathname.slice('/api/notifications/'.length);
			getNotifications(notifications, id, request, response);
			return;
		}
	}

	response.writeHead(...NotFound);
	response.end();
}

function getFeatures(features, request, response) {
	if (request.method !== Get) {
		response.writeHead(...MethodNotAllowed);
		response.end();
		return;
	}

	sendJson({features}, response);
}

async function addToQueue(queue, request, response) {
	if (request.method !== Put) {
		response.writeHead(...MethodNotAllowed);
		response.end();
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(request.headers, 'content-length')) {
		response.writeHead(...LengthRequired);
		response.end();
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(request.headers, 'content-type') ||
		!request.headers['content-type'].match(/^application\/javascript(; charset=utf-8)?$/)) {
		response.writeHead(...UnsupportedMediaType);
		response.end();
		return;
	}

	try {
		const object = await getJson(request);
		const result = queue.add(object);
		sendJson(result, response);
	} catch {
		response.writeHead(...BadRequest);
		response.end();
	}
}

function findMatch({findMatch: find}, queueId, request, response) {
	if (request.method !== Get) {
		response.writeHead(...MethodNotAllowed);
		response.end();
		return;
	}

	if (queueId !== '') {
		const result = find(queueId);
		if (result) {
			sendJson(result, response);
			return;
		}
	}

	// Note: original code returned 400
	response.writeHead(...NotFound);
	response.end();
}

function getNotifications({get}, subscriptionId, request, response) {
	if (request.method !== Get) {
		response.writeHead(...MethodNotAllowed);
		response.end();
		return;
	}

	if (subscriptionId !== '') {
		const result = get(subscriptionId);
		if (result) {
			sendJson(result, response);
			return;
		}
	}

	response.writeHead(...NotFound);
	response.end();
}

async function subscribe({subscribe: doSubscribe}, {inc}, request, response) {
	if (request.method !== Post) {
		response.writeHead(...MethodNotAllowed);
		response.end();
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(request.headers, 'content-length')) {
		response.writeHead(...LengthRequired);
		response.end();
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(request.headers, 'content-type') ||
		!request.headers['content-type'].match(/^application\/javascript(; charset=utf-8)?$/)) {
		response.writeHead(...UnsupportedMediaType);
		response.end();
		return;
	}

	try {
		const subscription = await getJson(request);
		if (!validSubscription(subscription)) {
			inc('notifications.failures.invalidsubscriberequest');
			throw new Error('Bad Request');
		}

		const result = doSubscribe(subscription);
		if (result) {
			inc('notifications.subscriptions');
			sendJson(result, response);
			return;
		}

		inc('notifications.failures.notsavedtodatabase');
		response.writeHead(...InternalServerError);
		response.end();
	} catch {
		response.writeHead(...BadRequest);
		response.end();
	}
}

async function unsubscribe({unsubscribe: doUnsubscribe}, {inc}, request, response) {
	if (request.method !== Post) {
		response.writeHead(...MethodNotAllowed);
		response.end();
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(request.headers, 'content-length')) {
		response.writeHead(...LengthRequired);
		response.end();
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(request.headers, 'content-type') ||
		!request.headers['content-type'].match(/^application\/javascript(; charset=utf-8)?$/)) {
		response.writeHead(...UnsupportedMediaType);
		response.end();
		return;
	}

	try {
		const unsubscription = await getJson(request);
		if (!validUnsubscription(unsubscription)) {
			throw new Error('Bad Request');
		}

		try {
			const result = doUnsubscribe(unsubscription);
			inc('notifications.unsubscriptions');
			sendJson(result, response);
		} catch {
			inc('notifications.failures.notremovedfromdatabase');
			response.writeHead(...InternalServerError);
			response.end();
		}
	} catch {
		inc('notifications.failures.invalidunsubscriberequest');
		response.writeHead(...BadRequest);
		response.end();
	}
}

function validSubscription(object) {
	return Object.prototype.hasOwnProperty.call(object, 'subscription') &&
		Object.prototype.hasOwnProperty.call(object, 'companyName') &&
		Object.prototype.hasOwnProperty.call(object.subscription, 'endpoint');
}

function validUnsubscription(object) {
	return Object.prototype.hasOwnProperty.call(object, 'companyName') &&
		Object.prototype.hasOwnProperty.call(object, 'subscriptionId');
}

function sendJson(object, response) {
	response.setHeader('Content-Type', Json);
	response.end(JSON.stringify(object), 'utf8');
}

async function getJson(request) {
	const payload = await getBody(request);
	/* c8 ignore next */
	return JSON.parse(payload);
}

function getBody(request) {
	return new Promise((resolve, reject) => {
		let buffer = '';
		request.on('error', reject);
		request.on('data', chunk => {
			buffer += chunk;
		});
		request.on('end', () => {
			if (request.complete) {
				resolve(buffer);
			} else {
				reject(NOT_COMPLETED);
			}
		});
	});
}
