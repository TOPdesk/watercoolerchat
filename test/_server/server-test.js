import tap from 'tap';
import {Server, RequestHandler} from '../../lib/_server/server.js';

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

test('Assets', sub => {
	sub.test('Requesting dotfiles', t => {
		const {respond} = new RequestHandler();
		const request = {url: '/.hidden', headers: {host: 'localhost'}};
		const response = new MockResponse();
		respond(request, response);
		t.same([{code: 404, message: 'Not found'}], response.head(), 'Is a 404');
		t.true(response.ended(), 'and closing response');
		t.end();
	});
	sub.end();
});

function MockResponse() {
	const head = [];
	let ended = false;
	return {
		head: () => head,
		ended: () => ended,
		writeHead: (code, message) => head.push({code, message}),
		end: () => {
			ended = true;
		}
	};
}
