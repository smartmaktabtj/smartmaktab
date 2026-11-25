import {gunzipSync,strFromU8} from 'fflate';
// Old Android browsers and restricted viewers can lack DecompressionStream.
globalThis.smartMaktabReadGzip=data=>JSON.parse(strFromU8(gunzipSync(data)));
