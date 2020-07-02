import tap from 'tap';
import {Router} from '../../lib/server/router.js';

const {test} = tap;

const router = new Router({
	api: new MockApiRequest(),
	asset: new MockAssetRequest()
});

test('API calls', t => {
	const request = {url: '/api/'};
	const response = {api: false, asset: false, setHeader: (name, value) => {}};
	router.handle(request, response);
	t.true(response.api, 'trigger API handler');
	t.false(response.asset, 'do not trigger Asset handler');
	t.end();
});

test('Asset calls', t => {
	const request = {url: '/notapi'};
	const response = {api: false, asset: false, setHeader: (name, value) => {}};
	router.handle(request, response);
	t.false(response.api, 'do not trigger API handler');
	t.true(response.asset, 'trigger Asset handler');
	t.end();
});

test('Company calls', t => {
	const request = {url: '/at/somecompany/'};
	const response = {api: false, asset: false, setHeader: (name, value) => {}};
	router.handle(request, response);
	t.false(response.api, 'do not trigger API handler');
	t.true(response.asset, 'trigger Asset handler');
	t.same(request.url, '/company.html', 'changes request to /company.html');
	t.end();
});

function MockAssetRequest() {
	return {
		handleRequest: (request, response) => {
			response.asset = true;
		}
	};
}

function MockApiRequest() {
	return {
		handleRequest: (request, response) => {
			response.api = true;
			response.url = request.url;
		}
	};
}
