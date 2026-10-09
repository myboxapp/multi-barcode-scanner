const $=id=>document.getElementById(id);
const video=$('video'), overlay=$('overlay'),ctx=overlay.getContext('2d');
const capture=document.createElement('canvas'),captureCtx=capture.getContext('2d',{willReadFrequently:true});
const records=new Map();let stream=null,worker=null,paused=false,busy=false,starting=false,facing='environment',torch=false,epoch=0,timer=null,timeout=null,last=[];
const emptyResults=$('resultList').innerHTML;
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function status(text,active=false){$('status').textContent=text;$('status').classList.toggle('active',active);}
function render(){
  $('count').textContent=records.size;$('clear').disabled=!records.size;
  if(!records.size){$('resultList').innerHTML=emptyResults;return;}
  $('resultList').replaceChildren();
  [...records.values()].reverse().forEach(record=>{
    const card=document.createElement('article');card.className='result';
    const top=document.createElement('div');top.className='result-top';
    const format=document.createElement('span');format.className='format';format.textContent=record.format.replaceAll('_',' ').toUpperCase();
    const time=document.createElement('time');time.dateTime=record.timestamp;time.textContent=new Date(record.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    top.append(format,time);const value=document.createElement('p');value.className='result-value';value.textContent=record.value;
    const copy=document.createElement('button');copy.textContent='Copy code';copy.setAttribute('aria-label',`Copy ${record.value}`);
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(record.value);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy code',1800);}catch{message('Copy is unavailable. Select the code text to copy it.',true);}};
    card.append(top,value,copy);$('resultList').append(card);
  });
}
function draw(codes=[],width=capture.width,height=capture.height){
  const box=$('viewfinder').getBoundingClientRect(),dpr=devicePixelRatio||1;
  overlay.width=box.width*dpr;overlay.height=box.height*dpr;ctx.scale(dpr,dpr);
  if(!width||!height)return;
  const scale=Math.min(box.width/width,box.height/height),ox=(box.width-width*scale)/2,oy=(box.height-height*scale)/2;
  for(const code of codes){
    const points=code.cornerPoints;if(!points?.length)continue;
    ctx.beginPath();points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](ox+p.x*scale,oy+p.y*scale));ctx.closePath();ctx.fillStyle='#b4f47722';ctx.fill();ctx.strokeStyle='#b4f477';ctx.lineWidth=2;ctx.stroke();
    const text=code.rawValue.length>28?code.rawValue.slice(0,25)+'…':code.rawValue;ctx.font='600 12px monospace';
    const tw=Math.min(ctx.measureText(text).width+16,box.width-16),x=Math.max(8,Math.min(ox+Math.min(...points.map(p=>p.x))*scale,box.width-tw-8)),y=Math.max(24,oy+Math.min(...points.map(p=>p.y))*scale-6);
    ctx.fillStyle='#b4f477';ctx.fillRect(x,y-22,tw,22);ctx.fillStyle='#152216';ctx.fillText(text,x+8,y-7,tw-16);
  }
}
function schedule(){clearTimeout(timer);if(stream&&!paused)timer=setTimeout(scan,140);}
function scan(){
  if(!stream||paused||busy)return;
  if(video.readyState<2||!video.videoWidth){schedule();return;}
  const ratio=Math.min(1,1600/video.videoWidth);capture.width=Math.round(video.videoWidth*ratio);capture.height=Math.round(video.videoHeight*ratio);
  captureCtx.drawImage(video,0,0,capture.width,capture.height);
  const frame=captureCtx.getImageData(0,0,capture.width,capture.height);busy=true;
  worker.postMessage({frame,id:epoch},[frame.data.buffer]);
  timeout=setTimeout(()=>{stopCamera();message('The scanner took too long to respond. Start the camera to retry.',true);},20000);
}
function setupWorker(){
  worker=new Worker(new URL('decoder.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    clearTimeout(timeout);busy=false;if(data.id!==epoch||!stream)return;
    if(data.error){stopCamera();message('The barcode engine could not start. Reload the page and try again.',true);return;}
    if(paused)return;
    last=data.codes;draw(last,data.width,data.height);$('visibleCount').textContent=`${last.length} in frame`;
    let changed=false;for(const code of last){if(!code.rawValue)continue;const key=JSON.stringify([code.format,code.rawValue]);if(!records.has(key)){records.set(key,{value:code.rawValue,format:code.format,timestamp:new Date().toISOString()});changed=true;}}
    if(changed)render();schedule();
  };
  worker.onerror=()=>{stopCamera();message('The scanner could not load. Reload the page to retry.',true);};
}
async function startCamera(){
  if(starting||stream)return;starting=true;const request=++epoch;$('start').disabled=true;$('start').textContent='Starting camera…';status('Connecting');
  try{
    if(!window.isSecureContext)throw Object.assign(new Error(),{name:'InsecureContext'});
    if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'Unsupported'});
    const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});
    if(request!==epoch){next.getTracks().forEach(t=>t.stop());return;}
    stream=next;video.srcObject=stream;await video.play();
    if(request!==epoch)return;
    setupWorker();paused=false;$('cameraEmpty').hidden=true;$('liveHint').hidden=false;$('toggle').disabled=false;$('stop').disabled=false;
    $('toggle').querySelector('span').textContent='Pause';
    const track=stream.getVideoTracks()[0],caps=track.getCapabilities?.()||{};$('torch').disabled=!caps.torch;$('torch').title=caps.torch?'Toggle flashlight':'Flashlight unavailable';
    const devices=await navigator.mediaDevices.enumerateDevices();if(request!==epoch)return;$('flip').disabled=devices.filter(d=>d.kind==='videoinput').length<2;
    track.onended=()=>{stopCamera();message('Camera disconnected. Start the camera to reconnect.',true);};
    status('Live',true);message('Scanning all visible codes. Results stay in this session.');schedule();
  }catch(error){
    if(request!==epoch)return;stopCamera();
    const errors={NotAllowedError:'Camera access was denied. Allow camera access in your browser settings, then try again.',NotFoundError:'No camera found. Open this page on a device with a camera.',NotReadableError:'Your camera is in use. Close other camera apps and try again.',InsecureContext:'Camera access requires HTTPS. Open the secure version of this page.',Unsupported:'This browser cannot access a camera. Try Safari or Chrome on your phone.'};
    message(errors[error.name]||'Could not start the camera. Check your camera permissions and try again.',true);
  }finally{starting=false;$('start').disabled=false;$('start').textContent='Start camera';}
}
function stopCamera(){
  ++epoch;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;busy=false;
  stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;video.srcObject=null;paused=false;torch=false;last=[];draw();
  $('cameraEmpty').hidden=false;$('liveHint').hidden=true;for(const id of ['toggle','flip','torch','stop'])$(id).disabled=true;
  $('torch').setAttribute('aria-pressed','false');$('visibleCount').textContent='0 in frame';status('Camera off');
}
$('start').onclick=startCamera;
$('stop').onclick=()=>{stopCamera();message('Camera stopped. Your scanned codes are still here.');};
$('toggle').onclick=()=>{
  paused=!paused;$('toggle').querySelector('span').textContent=paused?'Resume':'Pause';status(paused?'Paused':'Live',!paused);
  if(paused){clearTimeout(timer);last=[];draw();$('visibleCount').textContent='Paused';message('Detection paused. Your camera preview is still on.');}
  else{message('Scanning all visible codes.');schedule();}
};
$('flip').onclick=async()=>{facing=facing==='environment'?'user':'environment';stopCamera();await startCamera();};
$('torch').onclick=async()=>{const track=stream?.getVideoTracks()[0];if(!track)return;try{await track.applyConstraints({advanced:[{torch:!torch}]});torch=!torch;$('torch').setAttribute('aria-pressed',String(torch));}catch{message('This camera cannot change the flashlight setting.',true);}};
$('clear').onclick=()=>{records.clear();render();message('Session results cleared.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||starting)){stopCamera();message('Camera stopped while the app was in the background. Tap Start camera to resume.');}});
window.addEventListener('pagehide',stopCamera);new ResizeObserver(()=>draw(last)).observe($('viewfinder'));
const lifecycle=new AbortController();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'get_scanned_codes',description:'Read the unique barcode values detected in the current session.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object');return {codes:[...records.values()],cameraActive:!!stream,paused};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
window.addEventListener('pagehide',()=>lifecycle.abort());
