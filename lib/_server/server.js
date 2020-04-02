import {createServer} from 'http';

export function Server(requestHandler = defaultRequestHandler) {
	const server = createServer(requestHandler);
	return {
		start: (port = 3000) => server.listen(port),
		stop: () => server.close()
	};
}

function defaultRequestHandler(request, response) {
	return request.url.startsWith('/api/')
		? apiRequest(request, response)
		: assetRequest(request, response);
}

function apiRequest() {
	throw new Error('Not implemented');
}

function assetRequest() {
	throw new Error('Not implemented');
}
