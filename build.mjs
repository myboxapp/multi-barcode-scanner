import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
await build({entryPoints:['decoder.js'],bundle:true,format:'esm',outfile:'dist/decoder.js',minify:true});
await copyFile('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm','dist/zxing_reader.wasm');
