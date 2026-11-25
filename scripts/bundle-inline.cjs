const esbuild = require('esbuild');
const result=esbuild.buildSync({entryPoints:[process.argv[2]],bundle:true,format:'iife',minify:true,target:'es2022',charset:'utf8',write:false});
process.stdout.write(result.outputFiles[0].contents);
