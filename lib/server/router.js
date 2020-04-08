import {handleRequest as handleAssetRequest} from './asset.js';
import {handleRequest as handleApiRequest} from './api.js';

export function Router({api = handleApiRequest, asset = handleAssetRequest} = {}) {
	return {
		handle: (request, response) => request.url.startsWith('/api/')
			? api(request, response)
			: asset(request, response)
	};
}
