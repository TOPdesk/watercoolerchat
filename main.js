import {Server as _Server} from './lib/_server.js';
import {Server} from './lib/server.js';

const server = (process.env.NEW_SERVER || false)
	? new _Server()
	: new Server();

process.on('SIGINT', server.stop);
process.on('SIGTERM', server.stop);

server.start();
