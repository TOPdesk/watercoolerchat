import tap from 'tap';
import {Server} from '../../lib/server/httpserver.js';

const {test} = tap;

test('Server can be started and stopped', t => {
	t.plan(2);
	const server = new Server();
	t.resolves(new Promise(resolve => {
		server.start();
		resolve();
	}), 'Blocking start');
	setTimeout(() => t.resolves(server.stop(), 'Graceful stop'), 100);
});
