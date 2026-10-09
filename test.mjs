import {chromium} from '@playwright/test';
import bwip from 'bwip-js';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const qr=await bwip.toBuffer({bcid:'qrcode',text:'MULTISCAN-TEST-001',scale:5,padding:10});
const bar=await bwip.toBuffer({bcid:'code128',text:'ITEM-2048',scale:3,height:18,padding:10});
const server=createServer(async(req,res)=>{try{const p=req.url==='/'?'index.html':req.url.slice(1);const file=await readFile(new URL(`dist/${p}`,import.meta.url));res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(file);}catch{res.writeHead(404);res.end();}}).listen(8091,'127.0.0.1');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({qr,bar})=>{
  document.modelContext={registerTool(tool){window.agentTool=tool;}};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const c=canvas.getContext('2d');
   const images=await Promise.all([qr,bar].map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.src=src;})));
   const draw=()=>{c.fillStyle='white';c.fillRect(0,0,1200,800);c.drawImage(images[0],100,100);c.drawImage(images[1],520,300);requestAnimationFrame(draw);};draw();return canvas.captureStream(15);
  }});
  Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>[{kind:'videoinput',deviceId:'test'}]});
 },{qr:`data:image/png;base64,${qr.toString('base64')}`,bar:`data:image/png;base64,${bar.toString('base64')}`});
 await page.goto('http://127.0.0.1:8091');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/multiscan-mobile.png',fullPage:true});
 await page.click('#start');await page.waitForFunction(()=>document.querySelector('#count').textContent==='2',{},{timeout:30000});
 assert.match(await page.locator('#resultList').textContent(),/MULTISCAN-TEST-001/);assert.match(await page.locator('#resultList').textContent(),/ITEM-2048/);
 await page.waitForTimeout(800);assert.equal(await page.locator('#count').textContent(),'2');
 assert.equal(await page.locator('#visibleCount').textContent(),'2 in frame');
 const result=await page.evaluate(()=>window.agentTool.execute({}));assert.equal(result.codes.length,2);
 assert.equal(await page.evaluate(()=>{try{window.agentTool.execute({bad:true});return false;}catch{return true;}}),true);
 await page.click('#toggle');assert.equal(await page.locator('#status').textContent(),'Paused');
 await page.click('#toggle');await page.waitForFunction(()=>document.querySelector('#visibleCount').textContent==='2 in frame');
 await page.screenshot({path:'/tmp/multiscan-active.png',fullPage:true});
 await page.click('#stop');assert.equal(await page.locator('#status').textContent(),'Camera off');assert.equal(await page.locator('#count').textContent(),'2');
 await page.click('#clear');assert.equal(await page.locator('#count').textContent(),'0');
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/multiscan-desktop.png',fullPage:true});
 const denied=await browser.newPage();await denied.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
 await denied.goto('http://127.0.0.1:8091');await denied.click('#start');await denied.waitForFunction(()=>document.querySelector('#message').textContent.includes('denied'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: actual QR + Code 128 decoding, multiple outlines, deduplication, pause/resume, stop, clear, mobile layout, permission error, WebMCP read and validation.');
}finally{await browser.close();server.close();}
