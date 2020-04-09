import {AssetHandler} from './assethandler.js';
import {ApiHandler} from './apihandler.js';

export function Router({api = new ApiHandler(), asset = new AssetHandler()} = {}) {
	return {
		handle: (request, response) => {
			if (request.url.startsWith('/api/')) {
				api.handleRequest(request, response);
				return;
			}

			if (request.url.match(/^\/at\/[^/]+\//)) {
				request.url = '/company.html';
			}

			asset.handleRequest(request, response);
		}
	};
}
