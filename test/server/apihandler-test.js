import tap from 'tap';
import {PassThrough} from 'stream';
import {ApiHandler} from '../../lib/server/apihandler.js';

const {test} = tap;

const headers = {host: 'localhost'};
const requestParameters = {headers, method: 'GET'};
const notifications = new MockNotifications();
const metrics = new MockMetrics();
const {handleRequest: respond} = new ApiHandler({features: ['feature1', 'feature2'], queue: new MockQueue(), notifications, metrics});

test('/notapi', async t => {
	const request = new MockRequest({url: '/notapi', headers});
	const response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'is a 404');
	t.end();
});

test('/api/features/enabled', async t => {
	await testAllowedMethods(t, '/api/features/enabled');

	const request = new MockRequest({url: '/api/features/enabled', ...requestParameters});
	const response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {features: ['feature1', 'feature2']}, 'returns active features');
	t.end();
});

test('/api/queue', async t => {
	await testAllowedMethods(t, '/api/queue', ['PUT']);
	await testContentLength(t, '/api/queue', 'PUT');
	await testContentType(t, '/api/queue', 'PUT');

	const payload = {userName: 'user', companyName: 'company', subscriptionId: '1234'};
	const payloadLength = JSON.stringify(payload).length;
	const request = new MockRequest(
		{url: '/api/queue', ...requestParameters, method: 'PUT', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
		payload
	);
	const response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {userName: 'user', companyName: 'company', queueId: '4321'}, 'responds with answer from Queue.add');
	t.end();
});

test('/api/match', async t => {
	await testAllowedMethods(t, '/api/match/myid', ['POST']);

	let request = new MockRequest({url: '/api/match/', ...requestParameters, method: 'POST'});
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 to GET without QueueId');

	request = new MockRequest({url: '/api/match/notfound', ...requestParameters, method: 'POST'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 to GET with non-existing QueueId');

	request = new MockRequest({url: '/api/match/myid', ...requestParameters, method: 'POST'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {matchResult: 'myid', chatUrl: 'url', chatPartner: 'partner'}, 'responds with answer from Queue.findMatch');

	t.end();
});

test('/api/notifications', async t => {
	notifications._disable();
	let request = new MockRequest({url: '/api/notifications/', ...requestParameters});
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 if Notifiations are disabled');

	notifications._enable();

	await testAllowedMethods(t, '/api/notifications/');

	request = new MockRequest({url: '/api/notifications/', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 to GET without SubscriptionId');

	request = new MockRequest({url: '/api/notifications/notfound', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 to GET with non-existing SubscriptionId');

	request = new MockRequest({url: '/api/notifications/myid', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {validFor: ['myid']}, 'responds with answer from Notifications.get');

	t.test('subscribe', async _t => {
		notifications._disable();
		let request = new MockRequest({url: '/api/notifications/subscribe', ...requestParameters});
		let response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.head(), [404, 'Not Found'], 'responds 404 if Notifiations are disabled');

		notifications._enable();

		await testAllowedMethods(_t, '/api/notifications/subscribe', ['POST']);
		await testContentLength(_t, '/api/notifications/subscribe', 'POST');
		await testContentType(_t, '/api/notifications/subscribe', 'POST');

		let payload = {companyName: 'company', subscription: {}, subscriptionId: '1234'};
		let payloadLength = JSON.stringify(payload).length;
		request = new MockRequest(
			{url: '/api/notifications/subscribe', ...requestParameters, method: 'POST', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
			payload
		);
		response = new MockResponse();
		metrics.reset();
		respond(request, response);
		await response.finished;
		_t.same(response.head(), [400, 'Bad Request'], 'responds 400 to POST with bad Subscription data');
		_t.same(metrics.calls(), ['notifications.failures.invalidsubscriberequest'], 'Metric notifications.failures.invalidsubscriberequest incremented');

		payload = {companyName: 'company', subscription: {endpoint: 'endpoint'}, subscriptionId: 'fail'};
		payloadLength = JSON.stringify(payload).length;
		metrics.reset();
		request = new MockRequest(
			{url: '/api/notifications/subscribe', ...requestParameters, method: 'POST', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
			payload
		);
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.head(), [500, 'Internal Server Error'], 'responds 500 to POST with failed Subscription subscription');
		_t.same(metrics.calls(), ['notifications.failures.notsavedtodatabase'], 'Metric notifications.failures.notsavedtodatabase incremented');

		payload = {companyName: 'company', subscription: {endpoint: 'endpoint'}, subscriptionId: '1234'};
		payloadLength = JSON.stringify(payload).length;
		metrics.reset();
		request = new MockRequest(
			{url: '/api/notifications/subscribe', ...requestParameters, method: 'POST', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
			payload
		);
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.result(), {data: {success: true, subscriptionId: '1234'}, subscription: {endpoint: 'endpoint'}, companyName: 'company'}, 'responds with answer from Notifications.subscribe');
		_t.same(metrics.calls(), ['notifications.subscriptions'], 'Metric notifications.subscriptions incremented');
		_t.end();
	});

	t.test('unsubscribe', async _t => {
		notifications._disable();
		request = new MockRequest({url: '/api/notifications/unsubscribe', ...requestParameters});
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.head(), [404, 'Not Found'], 'responds 404 if Notifiations are disabled');

		notifications._enable();

		await testAllowedMethods(_t, '/api/notifications/unsubscribe', ['POST']);
		await testContentLength(_t, '/api/notifications/unsubscribe', 'POST');
		await testContentType(_t, '/api/notifications/unsubscribe', 'POST');

		let payload = {companyName: 'company'};
		let payloadLength = JSON.stringify(payload).length;
		request = new MockRequest(
			{url: '/api/notifications/unsubscribe', ...requestParameters, method: 'POST', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
			payload
		);
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.head(), [400, 'Bad Request'], 'responds 400 to POST with bad Unsubscription data');

		payload = {companyName: 'company', subscriptionId: 'fail'};
		payloadLength = JSON.stringify(payload).length;
		metrics.reset();
		request = new MockRequest(
			{url: '/api/notifications/unsubscribe', ...requestParameters, method: 'POST', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
			payload
		);
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.head(), [500, 'Internal Server Error'], 'responds 500 to POST with failed Subscription subscription');
		_t.same(metrics.calls(), ['notifications.failures.notremovedfromdatabase'], 'Metric notifications.failures.notremovedfromdatabase incremented');

		payload = {companyName: 'company', subscriptionId: '1234'};
		payloadLength = JSON.stringify(payload).length;
		metrics.reset();
		request = new MockRequest(
			{url: '/api/notifications/unsubscribe', ...requestParameters, method: 'POST', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/json'}},
			payload
		);
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		_t.same(response.result(), [{companyName: 'company'}], 'responds with answer from Notifications.unsubscribe');
		_t.same(metrics.calls(), ['notifications.unsubscriptions'], 'Metric notifications.unsubscriptions incremented');

		_t.end();
	});

	t.end();
});

function testAllowedMethods(t, url, allowed = ['GET']) {
	return new Promise(resolve => {
		['GET', 'HEAD', 'PUT', 'POST', 'DELETE'].forEach(async method => {
			if (!allowed.includes(method)) {
				const request = new MockRequest({url, ...requestParameters, method, headers});
				const response = new MockResponse();
				respond(request, response);
				await response.finished;
				t.same(response.head(), [405, 'Method Not Allowed'], `responds 405 to ${method}`);
			}
		});
		resolve();
	});
}

async function testContentLength(t, url, method = 'POST', contentType = 'application/json; charset=utf-8') {
	let request = new MockRequest({url, ...requestParameters, method});
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [411, 'Length Required'], `responds 411 to ${method} without Content-Length`);

	request = new MockRequest(
		{url, ...requestParameters, method, headers: {...headers, 'content-length': 1, 'content-type': contentType}},
		[],
		false
	);
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [400, 'Bad Request'], `responds 400 to ${method} with bad Content-Length`);
}

async function testContentType(t, url, method = 'POST') {
	const payload = {test: 'payload'};
	const payloadLength = JSON.stringify(payload).length;
	let request = new MockRequest(
		{url, ...requestParameters, method, headers: {...headers, 'content-length': payloadLength}},
		[],
		false
	);
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [415, 'Unsupported Media Type'], `responds 415 to ${method} with missing Content Type`);

	request = new MockRequest(
		{url, ...requestParameters, method, headers: {...headers, 'content-length': payloadLength, 'content-type': 'totally-not/content-type'}},
		[],
		false
	);
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [415, 'Unsupported Media Type'], `responds 415 to ${method} with invalid Content Type`);
}

function MockRequest(fields, object, complete = true) {
	const stream = new PassThrough();
	if (object) {
		stream.end(JSON.stringify(object), 'utf8');
	} else {
		stream.end();
	}

	const request = {...fields, complete};
	return Object.assign(stream, {...request});
}

function MockResponse() {
	const head = [];
	const headers = {};
	let object;
	let encoding;
	let finishedCallback;

	const response = {
		writeHead: (code, message) => {
			head.push(code);
			head.push(message);
		},
		setHeader: (header, value) => {
			headers[header] = value;
		},
		end: (json, enc) => {
			if (json) {
				object = JSON.parse(json);
			}

			if (enc) {
				encoding = enc;
			}

			finishedCallback();
		},
		head: () => Object.freeze(head),
		headers: () => Object.freeze(headers),
		result: () => Object.freeze(object),
		encoding: () => encoding,
		finished: new Promise(resolve => {
			finishedCallback = resolve;
		})
	};
	return response;
}

function MockQueue() {
	return {
		add: ({userName, companyName, subscriptionId}) => {
			return {
				queueId: subscriptionId.split('').reverse().join(''),
				userName,
				companyName
			};
		},
		findMatch: queueId => {
			return queueId === 'notfound'
				? false
				: {
					matchResult: queueId,
					chatUrl: 'url',
					chatPartner: 'partner'
				};
		}
	};
}

function MockNotifications() {
	let _enabled = true;
	return {
		enabled: () => _enabled,
		get: subscriptionId => {
			return subscriptionId === 'notfound'
				? false
				: {validFor: [subscriptionId]};
		},
		subscribe: ({subscriptionId, subscription, companyName}) => {
			if (subscriptionId === 'fail') {
				return false;
			}

			return {
				data: {success: true, subscriptionId},
				subscription,
				companyName
			};
		},
		unsubscribe: ({subscriptionId, companyName}) => {
			if (subscriptionId === 'fail') {
				throw new Error('Failed');
			}

			return [{
				companyName
			}];
		},
		_disable: () => {
			_enabled = false;
		},
		_enable: () => {
			_enabled = true;
		}
	};
}

function MockMetrics() {
	let _calls = [];
	return {
		inc: metric => _calls.push(metric),
		calls: () => Object.freeze(_calls.slice(0)),
		reset: () => {
			_calls = [];
		}
	};
}
