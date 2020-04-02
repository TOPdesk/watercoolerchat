import { default as tap } from 'tap';
// FIXME: importing now starts the server
//import '../lib/server.js';

tap.test('Dummy test', t => {
	t.true(true, 'passing');
	t.end();
});
