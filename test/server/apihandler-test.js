import tap from 'tap';
import {ApiHandler} from '../../lib/server/apihandler.js';

const {test} = tap;

const headers = {host: 'localhost'};
const {handleRequest: respond} = new ApiHandler({features: ['feature1', 'feature2']});

test('/notapi', t => {
	const request = {url: '/notapi', headers};
	const response = new MockResponse();
	respond(request, response);
	t.same(response.head(), [404, 'Not Found'], 'is a 404');
	t.end();
});

test('/api/features/enabled', async t => {
	const request = {url: '/api/features/enabled', headers};
	const response = new MockResponse();
	respond(request, response);
	await response.finished;
	t.same(response.result(), {features: ['feature1', 'feature2']}, 'returns active features');
	t.end();
});

function MockResponse() {
	const head = [];
	const headers = {};
	let object;
	let encoding;
	let finishedCallback;

	return {
		writeHead: (code, message) => {
			head.push(code);
			head.push(message);
		},
		setHeader: (header, value) => {
			headers[header] = value;
		},
		end: (json, enc) => {
			if (json) {
				object = JSON.parse(json);
			}

			if (enc) {
				encoding = enc;
			}

			finishedCallback();
		},
		head: () => Object.freeze(head),
		headers: () => Object.freeze(headers),
		result: () => Object.freeze(object),
		encoding: () => encoding,
		finished: new Promise(resolve => {
			finishedCallback = resolve;
		})
	};
}
