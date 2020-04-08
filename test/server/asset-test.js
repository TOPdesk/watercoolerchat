import tap from 'tap';
import {promises as fsPromises} from 'fs';
import {Writable} from 'stream';
import {createHash} from 'crypto';
import {handleRequest as respond} from '../../lib/server/asset.js';

const {test} = tap;
const {stat, readFile} = fsPromises;

const headers = {host: 'localhost'};

test('Requesting dotfiles', t => {
	const request = {url: '/.hidden', headers};
	const response = new MockResponse();
	respond(request, response);
	t.same(response.head(), [404, 'Not Found'], 'is a 404');
	t.end();
});

test('Breaking out of public', async t => {
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

test('Media Types', async t => {
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

test('Headers and Responses', async t => {
	let request = {url: '/favicon.ico', headers: {'if-modified-since': '3000-01-01T01:00:00.000Z', ...headers}};
	let response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [304, 'Not Modified'], 'if not modified since, it is a 304');

	const {mtime: faviconMtime, hash: faviconHash, buffer: faviconBuffer} = await getAssetInfo('public/favicon.ico');

	request = {url: '/favicon.ico', headers};
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.match(response.headers(), {'Last-Modified': faviconMtime}, 'response has Last Modified header set');
	t.match(response.headers(), {ETag: faviconHash}, 'response has Etag header set');
	t.match(response.headers(), {'Cache-Control': 'max-age=0, private'}, 'response has Cache Control header set');
	t.same(response.buffer(), faviconBuffer, 'returns content when no If-Modified-Since heder was sent');

	request = {url: '/favicon.ico', headers: {'if-modified-since': '2000-01-01T01:00:00.000Z', ...headers}};
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.buffer(), faviconBuffer, 'returns content when modified since');

	const {hash: indexHash, buffer: indexBuffer} = await getAssetInfo('public/index.html');
	request = {url: '/', headers: {'if-none-match': indexHash, ...headers}};
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.head(), [304, 'Not Modified'], 'if ETag matches, it is a 304');

	request = {url: '/', headers: {'if-none-match': 'notmatches', ...headers}};
	response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.buffer(), indexBuffer, 'returns content ETag does not match');

	t.end();
});

async function getAssetInfo(assetPath) {
	const {mtime} = await stat(assetPath);
	const buffer = await readFile(assetPath);
	const hash = createHash('md5');
	hash.setEncoding('hex');
	hash.end(buffer);
	return {
		mtime: new Date(mtime).toUTCString(),
		hash: hash.read(),
		buffer
	};
}

function MockResponse() {
	const stream = new Writable();
	const head = [];
	const headers = {};
	let buffer = Buffer.from([]);
	let finishedCallback = null;

	stream.finished = new Promise(resolve => {
		finishedCallback = resolve;
	});
	stream.head = () => Object.freeze(head);
	stream.headers = () => Object.freeze(headers);
	stream.write = chunk => {
		if (typeof chunk === 'string') {
			if (typeof buffer === 'string') {
				buffer += chunk;
				return;
			}

			buffer = chunk;
			return;
		}

		buffer = Buffer.concat([buffer, chunk]);
	};

	stream.buffer = () => Buffer.from(buffer);

	stream._end = stream.end;
	stream.end = (chunk, encoding) => stream._end(chunk, encoding, finishedCallback);

	stream.setHeader = (header, value) => {
		headers[header] = value;
	};

	stream.writeHead = (code, message) => {
		head.push(code);
		head.push(message);
	};

	return stream;
}
