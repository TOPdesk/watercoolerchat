import {Features} from '../features.js';
import {Queue} from '../queue.js';
import {Method, Response, ContentType} from './httpconstants.js';

const {'.js': Json} = ContentType;

export function ApiHandler({features = new Features(), queue = new Queue()} = {}) {
	return {
		handleRequest: (request, response) => handleRequest({features, queue}, request, response)
	};
}

function handleRequest({features, queue}, request, response) {
	const {NotFound, MethodNotAllowed} = Response;
	const {Put} = Method;
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	switch (pathname) {
		case '/api/features/enabled':
			sendJson({features}, response);
			break;
		/* TODO: implement
		case '/api/queue':
			if (request.method === Put) {
			} else {
				response.writeHead(...MethodNotAllowed);
				response.end();
			}
			break;
		*/
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
