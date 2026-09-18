
const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname,port=Number(process.env.PORT||4173),demo=process.argv.includes('--demo');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'};
http.createServer((req,res)=>{
 const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const relative=route==='/'?'index.html':route.slice(1);
 const target=path.resolve(root,relative);
 if(!target.startsWith(root+path.sep)||relative.startsWith('.')||relative.startsWith('tests/')){res.writeHead(403);return res.end();}
 const file=demo&&relative==='firebase.js'?path.join(root,'tests','firebase.mock.js'):target;
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');if(demo&&relative==='index.html')body=Buffer.from(body.toString().replace('MY MONEY / MY FLOW','BẢN XEM THỬ · DỮ LIỆU MẪU'));res.end(body);});
}).listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+port+(demo?' (sample data, no Firebase)':'')));
