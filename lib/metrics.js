export const incrementMetric = name => {
	countMetric(name, 1);
};

export const countMetric = (name, value) => {
	writeMetric('count', name, value);
};

export const measureMetric = (name, value) => {
	writeMetric('measure', name, value);
};

const writeMetric = (type, name, value) => {
	console.log(`${type}#${name}=${value}`);
};
