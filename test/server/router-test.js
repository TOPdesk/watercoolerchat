import tap from 'tap';
import {Router} from '../../lib/server/router.js';

const {test} = tap;

const router = new Router({
	api: (request, response) => {
		response.api = true;
	},
	asset: (request, response) => {
		response.asset = true;
	}
});

test('API calls', t => {
	const request = {url: '/api/'};
	const response = {api: false, asset: false};
	router.handle(request, response);
	t.true(response.api, 'trigger API handler');
	t.false(response.asset, 'do not trigger Asset handler');
	t.end();
});

test('Asset calls', t => {
	const request = {url: '/notapi'};
	const response = {api: false, asset: false};
	router.handle(request, response);
	t.false(response.api, 'do not trigger API handler');
	t.true(response.asset, 'trigger Asset handler');
	t.end();
});
