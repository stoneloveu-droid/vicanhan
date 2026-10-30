import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// GitHub Pages caches assets for ten minutes. Give every release one shared
// content-derived URL version, including the complete ES module dependency tree.
const root=fileURLToPath(new URL('../',import.meta.url));
const names=(await readdir(root)).filter(name=>name==='index.html'||/\.(?:js|css)$/.test(name)).sort();
const sources=await Promise.all(names.map(async name=>({name,text:await readFile(path.join(root,name),'utf8')})));
const canonical=text=>text.replace(/\?v=[a-f0-9]{12}(?=['"])/g,'');
const hash=createHash('sha256');
for(const {name,text} of sources)hash.update(name+'\0'+canonical(text)+'\0');
const version=hash.digest('hex').slice(0,12);
const references=/(['"])((?:\.\/)?[\w-]+\.(?:js|css))(?:\?v=[a-f0-9]{12})?\1/g;
const assets=new Set(names.filter(name=>name!=='index.html'));
const stale=[];
for(const {name,text} of sources){
  const next=text.replace(references,(match,quote,asset)=>assets.has(asset.replace(/^\.\//,''))?`${quote}${asset}?v=${version}${quote}`:match);
  if(next!==text){
    stale.push(name);
    if(!process.argv.includes('--check'))await writeFile(path.join(root,name),next);
  }
}
if(process.argv.includes('--check')&&stale.length){
  console.error('Asset URLs are stale. Run npm run version:assets before publishing: '+stale.join(', '));
  process.exitCode=1;
}else console.log(`Release assets: ${version}${process.argv.includes('--check')?' (verified)':''}`);
