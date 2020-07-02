import appInsights from 'applicationinsights';

let client = {
	trackEvent: event => console.log(event),
	trackMetric: metric => console.log(metric)
};

if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
	appInsights.setup().start();
	client = appInsights.defaultClient;
	console.log('Using AppInsights');
}

export function Metrics() {
	return {
		inc: name => incrementMetric(name)
	};
}

export const incrementMetric = name => {
	client.trackEvent({name});
};

export const measureMetric = (name, value) => {
	client.trackMetric({name, value});
};
