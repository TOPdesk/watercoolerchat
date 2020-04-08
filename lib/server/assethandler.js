import {basename, normalize, join, extname} from 'path';
import {createHash} from 'crypto';
import {createReadStream, promises as fsPromises} from 'fs';
import {libPath} from '../__libpath.js';
import {Response, ContentType} from './httpconstants.js';

const PUBLIC_ROOT = join(libPath(), '..', 'public');
const {stat} = fsPromises;

const CACHE = {};

export function AssetHandler() {
	return {
		handleRequest
	};
}

async function handleRequest(request, response) {
	// TODO: respond to GET
	// TODO: respond to HEAD
	// TODO: respond 405 to other methods
	const {pathname} = new URL(request.url, `http://${request.headers.host}`);
	const assetPath = getAssetPath(pathname);
	const {NotFound, NotModified, UnsupportedMediaType, InternalServerError} = Response;

	if (basename(assetPath).startsWith('.')) {
		response.writeHead(...NotFound);
		response.end();
		return;
	}

	const contentType = ContentType[extname(assetPath)];
	if (contentType) {
		response.setHeader('Content-Type', contentType);
	} else {
		response.writeHead(...UnsupportedMediaType);
		response.end();
		return;
	}

	response.setHeader('Cache-Control', 'max-age=0, private');

	const lastModified = await getLastModified(assetPath);
	if (lastModified) {
		response.setHeader('Last-Modified', lastModified);
	}

	const hash = await getHash(assetPath);
	if (hash) {
		response.setHeader('ETag', hash);
	}

	if (lastModified && Object.prototype.hasOwnProperty.call(request.headers, 'if-modified-since')) {
		const modifiedSince = request.headers['if-modified-since'];
		if (Date.parse(lastModified) <= Date.parse(modifiedSince)) {
			response.writeHead(...NotModified);
			response.end();
			return;
		}
	}

	if (hash && Object.prototype.hasOwnProperty.call(request.headers, 'if-none-match')) {
		if (hash === request.headers['if-none-match']) {
			response.writeHead(...NotModified);
			response.end();
			return;
		}
	}

	const stream = createReadStream(assetPath);
	stream.on('error', error => {
		if (error.code === 'ENOENT') {
			response.writeHead(...NotFound);
			response.end();
			return;
			/* c8 ignore next 4 */
		}

		process.stderr.write(`[ERROR]\t${error}\n`);
		response.writeHead(...InternalServerError);
	});

	if (contentType.endsWith('charset=utf-8')) {
		stream.setEncoding('utf8');
	}

	stream.on('open', () => stream.pipe(response));
}

function getAssetPath(pathname) {
	const absolute = join(PUBLIC_ROOT, autoIndex(pathname));
	return normalize(absolute);
}

function autoIndex(pathname) {
	return pathname.endsWith('/')
		? '/index.html'
		: pathname;
}

async function getLastModified(assetPath) {
	const asset = getAssetCache(assetPath);
	if (!Object.prototype.hasOwnProperty.call(asset, 'mtime')) {
		try {
			const {mtime} = await stat(assetPath);
			asset.mtime = new Date(mtime).toUTCString();
		} catch {
			// AssetPath does not exists
			return undefined;
		}
	}

	/* c8 ignore next */
	return asset.mtime;
}

async function getHash(assetPath) {
	const asset = getAssetCache(assetPath);
	if (!Object.prototype.hasOwnProperty.call(asset, 'hash')) {
		const promise = new Promise((resolve, reject) => {
			const hash = createHash('md5');
			const stream = createReadStream(assetPath);
			hash.setEncoding('hex');
			stream.on('error', reject);
			stream.on('end', () => {
				hash.end();
				resolve(hash.read());
			});
			stream.pipe(hash);
		});
		try {
			asset.hash = await promise;
		} catch {
			// AssetPath does not exists
			return undefined;
		}
	}

	/* c8 ignore next */
	return asset.hash;
}

function getAssetCache(assetPath) {
	if (!Object.prototype.hasOwnProperty.call(CACHE, assetPath)) {
		CACHE[assetPath] = {};
	}

	return CACHE[assetPath];
}
