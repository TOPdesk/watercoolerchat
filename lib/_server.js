import {createServer} from 'http';
import {basename} from 'path';

export function Server({respond} = new RequestHandler()) {
	const server = createServer(respond);
	return {
		start: (port = 3000) => {
			process.stdout.write(`Starting WatercoolerChat Server\tPort: ${port}\n`);
			server.listen(port);
		},
		stop: () => {
			const promise = new Promise(resolve => {
				server.close(() => {
					process.stdout.write('\tOK\n');
					resolve();
				});
			});
			process.stdout.write('\nStopping WatercoolerChat Server');
			return promise;
		}
	};
}

export function RequestHandler() {
	return {
		respond: (request, response) =>
			request.url.startsWith('/api/')
				? apiRequest(request, response)
				: assetRequest(request, response)
	};
}

function apiRequest() {
	throw new Error('Not implemented');
}

function assetRequest(request, response) {
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	const assetPath = getAssetPath(pathname);

	if (basename(assetPath).startsWith('.')) {
		response.writeHead(404, 'Not found');
		response.end();
		return;
	}

	// TODO: check if not modified

	// TODO: set up content type, cache control, encoding, and open stream
}

function getAssetPath(pathname) {
	return `public${autoIndex(pathname)}`;
}

function autoIndex(pathname) {
	return pathname === '/'
		? '/index.html'
		: pathname;
}
