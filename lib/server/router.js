import {AssetHandler} from './assethandler.js';
import {ApiHandler} from './apihandler.js';

export function Router({api = new ApiHandler(), asset = new AssetHandler()} = {}) {
	return {
		handle: (request, response) => request.url.startsWith('/api/')
			? api.handleRequest(request, response)
			: asset.handleRequest(request, response)
	};
}
