import tap from 'tap';
import {PassThrough} from 'stream';
import {ApiHandler} from '../../lib/server/apihandler.js';

const {test} = tap;

const headers = {host: 'localhost'};
const requestParameters = {headers, method: 'GET'};
const {handleRequest: respond} = new ApiHandler({features: ['feature1', 'feature2'], queue: new MockQueue()});

test('/notapi', async t => {
	const request = new MockRequest({url: '/notapi', headers});
	const response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'is a 404');
	t.end();
});

test('/api/features/enabled', async t => {
	let request = new MockRequest({url: '/api/features/enabled', ...requestParameters, method: 'HEAD'});
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to HEAD');

	request = new MockRequest({url: '/api/features/enabled', ...requestParameters, method: 'PUT'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to PUT');

	request = new MockRequest({url: '/api/features/enabled', ...requestParameters, method: 'POST'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to POST');

	request = new MockRequest({url: '/api/features/enabled', ...requestParameters, method: 'DELETE'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to DELETE');

	request = new MockRequest({url: '/api/features/enabled', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {features: ['feature1', 'feature2']}, 'returns active features');
	t.end();
});

test('/api/queue', async t => {
	let request = new MockRequest({url: '/api/queue', ...requestParameters});
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to GET');

	request = new MockRequest({url: '/api/queue', ...requestParameters, method: 'HEAD'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to HEAD');

	request = new MockRequest({url: '/api/queue', ...requestParameters, method: 'POST'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to POST');

	request = new MockRequest({url: '/api/queue', ...requestParameters, method: 'DELETE'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to DELETE');

	request = new MockRequest({url: '/api/queue', ...requestParameters, method: 'PUT'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [411, 'Length Required'], 'responds 411 to PUT without Content-Length');

	request = new MockRequest(
		{url: '/api/queue', ...requestParameters, method: 'PUT', headers: {...headers, 'content-length': 1, 'content-type': 'application/javascript; charset=utf-8'}},
		[],
		false
	);
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [400, 'Bad Request'], 'responds 400 to PUT with bad Content-Length');

	const payload = {userName: 'user', companyName: 'company', subscriptionId: '1234'};
	const payloadLength = JSON.stringify(payload).length;
	request = new MockRequest(
		{url: '/api/queue', ...requestParameters, method: 'PUT', headers: {...headers, 'content-length': payloadLength}},
		[],
		false
	);
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [415, 'Unsupported Media Type'], 'responds 415 to PUT with missing Content Type');

	request = new MockRequest(
		{url: '/api/queue', ...requestParameters, method: 'PUT', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/xml'}},
		[],
		false
	);
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [415, 'Unsupported Media Type'], 'responds 415 to PUT with invalid Content Type');

	request = new MockRequest(
		{url: '/api/queue', ...requestParameters, method: 'PUT', headers: {...headers, 'content-length': payloadLength, 'content-type': 'application/javascript'}},
		payload
	);
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {userName: 'user', companyName: 'company', queueId: '4321'}, 'responds with answer from Queue.add');
	t.end();
});

test('/api/match', async t => {
	let request = new MockRequest({url: '/api/match/', ...requestParameters, method: 'HEAD'});
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to HEAD');

	request = new MockRequest({url: '/api/match/', ...requestParameters, method: 'POST'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to POST');

	request = new MockRequest({url: '/api/match/', ...requestParameters, method: 'PUT'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to PUT');

	request = new MockRequest({url: '/api/match/', ...requestParameters, method: 'DELETE'});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [405, 'Method Not Allowed'], 'responds 405 to DELETE');

	request = new MockRequest({url: '/api/match/', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 to GET without QueueId');

	request = new MockRequest({url: '/api/match/myid', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {matchResult: 'myid', chatUrl: 'url', chatPartner: 'partner'}, 'responds with answer from Queue.findMatch');

	request = new MockRequest({url: '/api/match/notfound', ...requestParameters});
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [404, 'Not Found'], 'responds 404 to GET with non-existing QueueId');

	t.end();
});

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
