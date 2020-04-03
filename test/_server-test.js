import tap from 'tap';
import {Server, RequestHandler} from '../lib/_server.js';

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
	const headers = {host: 'localhost'};
	const {respond} = new RequestHandler();
	sub.test('Requesting dotfiles', t => {
		const request = {url: '/.hidden', headers};
		const response = new MockResponse();
		respond(request, response);
		t.same(response.head(), [404, 'Not Found'], 'is a 404');
		t.true(response.ended(), 'and closing response');
		t.end();
	});
	sub.test('Breaking out of public', async t => {
		let request;
		let response;

		request = {url: '../main.js', headers};
		response = new MockResponse();
		respond(request, response);
		await response.promise;
		t.same(response.head(), [404, 'Not Found'], '../main.js is a 404');
		t.true(response.ended(), 'and closing response');

		request = {url: '%2E%2E/main.js', headers};
		response = new MockResponse();
		respond(request, response);
		await response.promise;
		t.same(response.head(), [404, 'Not Found'], '%2E%2E/main.js is a 404');
		t.true(response.ended(), 'and closing response');
		t.end();
	});
	sub.test('Media Types', async t => {
		let request;
		let response;

		request = {url: '/some.css', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.headers(), ['Content-Type', 'text/css; charset=utf-8'], 'css has text/css content type, and utf-8 encoding');
		await response.promise;

		request = {url: '/some.html', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.headers(), ['Content-Type', 'text/html; charset=utf-8'], 'html has text/html content type, and utf-8 encoding');
		await response.promise;

		request = {url: '/some.ico', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.headers(), ['Content-Type', 'image/x-icon'], 'ico has image/x-icon content type');
		await response.promise;

		request = {url: '/some.js', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.headers(), ['Content-Type', 'application/javascript; charset=utf-8'], 'js has text/html content type, and utf-8 encoding');
		await response.promise;

		request = {url: '/some.png', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.headers(), ['Content-Type', 'image/png'], 'png has image/png content type');
		await response.promise;

		request = {url: '/some.svg', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.headers(), ['Content-Type', 'image/svg+xml; charset=utf-8'], 'svg has image/svg+xml content type, and utf-8 encoding');
		await response.promise;

		request = {url: '/some.unknown', headers};
		response = new MockResponse();
		respond(request, response);
		t.same(response.head(), [415, 'Unsupported Media Type'], 'unknown extension is a 415');
		t.true(response.ended(), 'and closing response');

		t.end();
	});
	sub.test('Caching', async t => {
		const request = {url: '/favicon.ico', headers: Object.assign(headers, {'if-modified-since': '3000-01-01T01:00:00.000Z'})};
		const response = new MockResponse();
		respond(request, response);
		await response.promise;
		t.same(response.head(), [304, 'Not Modified'], 'if not modified sine, it is a 304');
		// TODO: cache control, last modified in response
		t.end();
	});
	sub.end();
});

function MockResponse() {
	const head = [];
	const headers = [];
	let ended = false;
	let _resolve = null;
	const promise = new Promise(resolve => {
		_resolve = resolve;
	});
	return {
		head: () => Object.freeze(head),
		ended: () => ended,
		writeHead: (code, message) => {
			head.push(code);
			head.push(message);
		},
		end: () => {
			ended = true;
			_resolve();
		},
		setHeader: (header, value) => {
			headers.push(header);
			headers.push(value);
		},
		headers: () => Object.freeze(headers),
		promise
	};
}
