import {Features} from '../features.js';
import {Queue} from '../queue.js';
import {Response, ContentType} from './httpconstants.js';

const {'.js': Json} = ContentType;

export function ApiHandler({features = new Features(), queue = new Queue()} = {}) {
	return {
		handleRequest: (request, response) => handleRequest({features, queue}, request, response)
	};
}

function handleRequest({features}, request, response) {
	const {NotFound} = Response;
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	switch (pathname) {
		case '/api/features/enabled':
			sendJson({features}, response);
			break;
		default:
			response.writeHead(...NotFound);
			response.end();
			break;
	}
}

function sendJson(object, response) {
	response.setHeader('Content-Type', Json);
	response.end(JSON.stringify(object), 'utf8');
}
