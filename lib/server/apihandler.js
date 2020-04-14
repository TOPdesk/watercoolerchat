import {Features} from '../features.js';
import {Queue} from '../queue.js';
import {Notifications} from '../notifications.js';
import {Method, Response, ContentType} from './httpconstants.js';

const {'.js': Json} = ContentType;
const {NotFound, MethodNotAllowed, BadRequest, LengthRequired, UnsupportedMediaType} = Response;
const {Get, Put} = Method;

const NOT_COMPLETED = new Error('Not Completed');

export function ApiHandler({features = new Features(), queue = new Queue(), notifications = new Notifications()} = {}) {
	return {
		handleRequest: (request, response) => handleRequest({features, queue, notifications}, request, response)
	};
}

async function handleRequest({features, queue, notifications}, request, response) {
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

	if (notifications.enabled()) {
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

function subscribe() {

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
