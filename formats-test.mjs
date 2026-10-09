import {chromium} from '@playwright/test';
import bwip from 'bwip-js';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixtures=[
 ['Codabar','rationalizedCodabar','A12345678B','codabar','A12345678B'],
 ['Code 11','code11','123456-789','code_11','123456-789'],
 ['Code 25','code2of5','12345678','industrial_2_of_5','12345678'],
 ['Code 25 (Matrix)','matrix2of5','87654321','matrix_2_of_5','87654321'],
 ['Code 32','code32','01234567','code_32','A012345676'],
 ['Code 39','code39','ABC-12345','code_39','ABC-12345'],
 ['Code 93','code93','ABC-12345','code_93','ABC-12345'],
 ['Code 128','code128','ITEM-2048','code_128','ITEM-2048'],
 ['GS1 DataBar','databaromni','(01)09521234543213','databar_omni','0109521234543213'],
 ['GS1 DataBar Expanded','databarexpanded','(01)09521234543213(3103)000123','databar_expanded','01095212345432133103000123'],
 ['EAN-13','ean13','9521234567899','ean_13','9521234567899'],
 ['EAN-8','ean8','95200002','ean_8','95200002'],
 ['IATA 2 of 5','iata2of5','12345678901234567','iata_2_of_5','12345678901234567'],
 ['Industrial 2 of 5','industrial2of5','98765432','industrial_2_of_5','98765432'],
 ['ITF','interleaved2of5','12345678','itf','12345678'],
 ['MSI Plessey','msi','12345678','msi_plessey','12345678'],
 ['UPC-A','upca','012345678905','upc_a','012345678905'],
 ['UPC-E','upce','01234558','upc_e','01234558'],
];
const server=createServer(async(req,res)=>{try{const p=req.url==='/'?'index.html':req.url.slice(1);const file=await readFile(new URL(`dist/${p}`,import.meta.url));res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(file);}catch{res.writeHead(404);res.end();}}).listen(8092,'127.0.0.1');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8092');
 await page.evaluate(()=>{window.decoder=new Worker('/decoder.js',{type:'module'});});
 async function decode(items,{angle=0,scale=3,blur=0,negative=null}={}){
  const images=await Promise.all(items.map(async([,bcid,text])=>`data:image/png;base64,${(await bwip.toBuffer({bcid,text,scale,height:22,padding:14,backgroundcolor:'FFFFFF',includecheck:bcid==='code93'})).toString('base64')}`));
  return await page.evaluate(async({images,angle,blur,negative})=>{
   const imgs=await Promise.all(images.map(async src=>{const img=new Image();img.src=src;await img.decode();return img;}));
   const c=document.createElement('canvas');const maxWidth=Math.max(1,...imgs.map(i=>i.width)),maxHeight=Math.max(1,...imgs.map(i=>i.height));
   const radians=angle*Math.PI/180;
   c.width=Math.ceil(Math.abs(maxWidth*Math.cos(radians))+Math.abs(maxHeight*Math.sin(radians)))+120;
   const cellHeight=Math.ceil(Math.abs(maxWidth*Math.sin(radians))+Math.abs(maxHeight*Math.cos(radians)))+100;
   c.height=Math.max(300,cellHeight*imgs.length);
   const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
   imgs.forEach((img,i)=>{ctx.save();ctx.translate(c.width/2,cellHeight*i+cellHeight/2);ctx.rotate(radians);ctx.filter=blur?`blur(${blur}px)`:'none';ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();});
   if(negative==='blank'){ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);}
   if(negative==='cropped'){ctx.fillStyle='white';ctx.fillRect(0,0,c.width/2,c.height);}
   if(negative==='noise'){let seed=42;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};ctx.fillStyle='#333';for(let n=0;n<1000;n++)ctx.fillRect(rand()*c.width,rand()*c.height,rand()*6,rand()*20);}
   const frame=ctx.getImageData(0,0,c.width,c.height);const t=performance.now();
   return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Decode timed out')),15000);decoder.onmessage=({data})=>{clearTimeout(timeout);resolve({...data,ms:Math.round(performance.now()-t)});};decoder.postMessage({frame,id:1},[frame.data.buffer]);});
  },{images,angle,blur,negative});
 }
 function validate(result,items,label){
  assert.equal(result.error,undefined,label+': decoder error');
  const actual=result.codes.map(c=>[c.format,c.rawValue].join(':')).sort();
  const expected=items.map(f=>[f[3],f[4]].join(':')).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))console.log('MISMATCH BOXES',JSON.stringify(result.codes));
  assert.deepEqual(actual,expected,label);
  for(const code of result.codes){assert.equal(code.cornerPoints.length,4);assert.ok(code.boundingBox.width>0&&code.boundingBox.height>0);}
  console.log('PASS',label,`(${result.ms} ms)`);
 }
 for(const fixture of fixtures)validate(await decode([fixture]),[fixture],fixture[0]);
 const legacy=fixtures.filter(f=>['code11','code2of5','matrix2of5','iata2of5','industrial2of5','msi'].includes(f[1]));
 for(const fixture of legacy){
  for(const angle of [15,90,180,270])validate(await decode([fixture],{angle,scale:2,blur:.3}),[fixture],fixture[0]+` rotated ${angle}°`);
 }
 validate(await decode([legacy[0],legacy[3],legacy[5]]),[legacy[0],legacy[3],legacy[5]],'Mixed legacy formats in one frame');
 validate(await decode([legacy[0],legacy[0]]),[legacy[0],legacy[0]],'Two physical copies of the same value');
 for(const negative of ['blank','noise','cropped'])validate(await decode([legacy[0]],{negative}),[],negative+' negative image');
 console.log('All format, rotation, multi-code, duplicate-position and negative-image assertions passed.');
}finally{await browser.close();server.close();}
