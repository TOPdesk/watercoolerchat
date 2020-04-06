import {isEnabled as notificationsEnabled} from './notifications.js';

export const getEnabledFeatures = ctx => {
	const features = ['base'];
	if (notificationsEnabled()) {
		features.push('notifications');
	}

	ctx.response.type = 'json';
	ctx.response.body = JSON.stringify({features});
};
