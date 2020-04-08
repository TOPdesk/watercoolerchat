export const Response = Object.freeze({
	NotModified: [304, 'Not Modified'],
	NotFound: [404, 'Not Found'],
	MethodNotAllowed: [405, 'Method Not Allowed'],
	UnsupportedMediaType: [415, 'Unsupported Media Type'],
	InternalServerError: [500, 'Internal Server Error']
});

export const ContentType = Object.freeze({
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'application/javascript; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml; charset=utf-8'
});

export const Method = Object.freeze({
	Get: 'GET',
	Head: 'HEAD',
	Put: 'PUT'
});
