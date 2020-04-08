import {Features} from '../features.js';

export function ApiHandler({features = new Features()} = {}) {
	return {
		handleRequest: (request, response) => handleRequest({features}, request, response)
	};
}

function handleRequest({features}, request, response) {
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	switch (pathname) {
		case '/api/features/enabled':
			sendJson({features}, response);
			break;
		default:
			response.writeHead(404, 'Not Found');
			response.end();
			break;
	}
}

function sendJson(object, response) {
	response.setHeader('Content-Type', 'application/json; charset=utf-8');
	response.end(JSON.stringify(object), 'utf8');
}
