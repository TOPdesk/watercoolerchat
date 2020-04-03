// Linters can not parse import.meta.url
// This construct can return the public dir relative to this module.

import {fileURLToPath} from 'url';
import {normalize, dirname, join} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PUBLIC_ROOT = normalize(join(__dirname, '..', 'public'));
