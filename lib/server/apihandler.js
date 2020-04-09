import {Features} from '../features.js';
import {Queue} from '../queue.js';
import {Method, Response, ContentType} from './httpconstants.js';

const {'.js': Json} = ContentType;
const {NotFound, MethodNotAllowed, BadRequest, LengthRequired} = Response;
const {Put} = Method;

const NOT_COMPLETED = new Error('Not Completed');

export function ApiHandler({features = new Features(), queue = new Queue()} = {}) {
	return {
		handleRequest: (request, response) => handleRequest({features, queue}, request, response)
	};
}

async function handleRequest({features, queue}, request, response) {
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	switch (pathname) {
		case '/api/features/enabled':
			sendJson({features}, response);
			break;
		case '/api/queue':
			addToQueue(queue, request, response);
			break;
		default:
			response.writeHead(...NotFound);
			response.end();
			break;
	}
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

	// TODO: check content type

	try {
		const object = await getJson(request);
		const result = queue.add(object);
		sendJson(result, response);
	} catch {
		response.writeHead(...BadRequest);
		response.end();
	}
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
