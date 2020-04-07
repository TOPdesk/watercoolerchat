import tap from 'tap';
import {promises as fsPromises} from 'fs';
import {Writable} from 'stream';
import {createHash} from 'crypto';
import {Server, RequestHandler} from '../lib/_server.js';

const {test} = tap;
const {stat, readFile} = fsPromises;

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
		t.end();
	});
	sub.test('Breaking out of public', async t => {
		let request;
		let response;

		request = {url: '../main.js', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.same(response.head(), [404, 'Not Found'], '../main.js is a 404');

		request = {url: '%2E%2E/main.js', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.same(response.head(), [404, 'Not Found'], '%2E%2E/main.js is a 404');
		t.end();
	});
	sub.test('Media Types', async t => {
		let request;
		let response;

		request = {url: '/some.css', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Content-Type': 'text/css; charset=utf-8'}, 'css has text/css content type, and utf-8 encoding');

		request = {url: '/some.html', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Content-Type': 'text/html; charset=utf-8'}, 'html has text/html content type, and utf-8 encoding');

		request = {url: '/some.ico', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Content-Type': 'image/x-icon'}, 'ico has image/x-icon content type');

		request = {url: '/some.js', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Content-Type': 'application/javascript; charset=utf-8'}, 'js has text/html content type, and utf-8 encoding');

		request = {url: '/some.png', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Content-Type': 'image/png'}, 'png has image/png content type');

		request = {url: '/some.svg', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Content-Type': 'image/svg+xml; charset=utf-8'}, 'svg has image/svg+xml content type, and utf-8 encoding');

		request = {url: '/some.unknown', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.same(response.head(), [415, 'Unsupported Media Type'], 'unknown extension is a 415');

		t.end();
	});
	sub.test('Caching', async t => {
		let request = {url: '/favicon.ico', headers: {'if-modified-since': '3000-01-01T01:00:00.000Z', ...headers}};
		let response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.same(response.head(), [304, 'Not Modified'], 'if not modified sine, it is a 304');

		const {mtime} = await stat('public/favicon.ico');
		const faviconMtime = new Date(mtime).toUTCString();
		const faviconBuffer = await readFile('public/favicon.ico');
		const hash = createHash('md5');
		hash.setEncoding('hex');
		hash.end(faviconBuffer);
		const faviconHash = hash.read();

		request = {url: '/favicon.ico', headers};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.match(response.headers(), {'Last-Modified': faviconMtime}, 'response has Last Modified header set');
		t.match(response.headers(), {'ETag': faviconHash}, 'response has Etag header set');
		t.match(response.headers(), {'Cache-Control': 'max-age=0, private'}, 'response has Cache Control header set');
		t.same(response.buffer(), faviconBuffer, 'returns content when no If-Modified-Since heder was sent');

		request = {url: '/favicon.ico', headers: {'if-modified-since': '2000-01-01T01:00:00.000Z', ...headers}};
		response = new MockResponse();
		respond(request, response);
		await response.finished;
		t.same(response.buffer(), faviconBuffer, 'returns content when modified since');

		// TODO: if-none-match

		t.end();
	});
	sub.end();
});

function MockResponse() {
	const stream = new Writable();
	const head = [];
	const headers = {};
	let buffer = Buffer.from([]);
	let _resolve = null;

	stream.finished = new Promise(resolve => {
		_resolve = resolve;
	});
	stream.head = () => Object.freeze(head);
	stream.headers = () => Object.freeze(headers);
	stream.write = chunk => {
		buffer = Buffer.concat([buffer, chunk]);
	};

	stream._end = stream.end;
	stream.end = (chunk, encoding) => stream._end(chunk, encoding, _resolve);
	stream.buffer = () => Buffer.from(buffer);
	stream.setHeader = (header, value) => {
		headers[header] = value;
	};

	stream.writeHead = (code, message) => {
		head.push(code);
		head.push(message);
	};

	return stream;
}
