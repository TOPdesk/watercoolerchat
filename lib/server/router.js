import {AssetHandler} from './assethandler.js';
import {ApiHandler} from './apihandler.js';

export function Router({api = new ApiHandler(), asset = new AssetHandler()} = {}) {
	return {
		handle: (request, response) => {
			response.setHeader("x-content-type-options", "nosniff");
			response.setHeader("x-xss-protection", "1; mode=block");
			response.setHeader("x-frame-options", "DENY");
			response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
			response.setHeader("referrer-policy", "no-referrer");

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
