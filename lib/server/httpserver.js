import {createServer} from 'http';
import {Router} from './router.js';

export function Server({handle} = new Router()) {
	const server = createServer(handle);
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
