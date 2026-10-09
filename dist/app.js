const $=id=>document.getElementById(id);
const video=$('video'), overlay=$('overlay'),ctx=overlay.getContext('2d');
const capture=document.createElement('canvas'),captureCtx=capture.getContext('2d',{willReadFrequently:true});
const records=new Map();let stream=null,worker=null,paused=false,busy=false,starting=false,facing='environment',torch=false,torchBusy=false,epoch=0,timer=null,timeout=null,last=[];
let imageMode=false,imageUrl=null;
const emptyResults=$('resultList').innerHTML;
const formatNames={code_11:'Code 11',code_32:'Code 32',industrial_2_of_5:'Industrial 2 of 5 / Code 25',iata_2_of_5:'IATA 2 of 5',matrix_2_of_5:'Code 25 (Matrix)',msi_plessey:'MSI Plessey',databar_omni:'GS1 DataBar',databar_stacked:'GS1 DataBar Stacked',databar_stacked_omni:'GS1 DataBar Stacked',databar_limited:'GS1 DataBar Limited',databar_expanded:'GS1 DataBar Expanded',databar_expanded_stacked:'GS1 DataBar Expanded Stacked',upc_a:'UPC-A',upc_e:'UPC-E',ean_13:'EAN-13',ean_8:'EAN-8'};
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function status(text,active=false){$('status').textContent=text;$('status').classList.toggle('active',active);}
function updateTorch(available=false){
  $('torch').disabled=!available||torchBusy;
  $('torch').setAttribute('aria-pressed',String(torch));
  $('torch').setAttribute('aria-label',torch?'Turn flash off':'Turn flash on');
  $('torch').querySelector('span').textContent=available?(torch?'Flash on':'Flash off'):'Flash unavailable';
  $('torch').title=available?'Toggle camera flashlight':'This camera or browser does not support flash control';
}
function barcodeClip(code){
  const points=code.cornerPoints||[];
  if(!points.length)return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  if(![...xs,...ys].every(Number.isFinite))return null;
  const padding=12,x=Math.max(0,Math.floor(Math.min(...xs))-padding),y=Math.max(0,Math.floor(Math.min(...ys))-padding);
  const width=Math.min(capture.width,Math.ceil(Math.max(...xs))+padding)-x,height=Math.min(capture.height,Math.ceil(Math.max(...ys))+padding)-y;
  if(width<=0||height<=0)return null;
  const clip=document.createElement('canvas'),scale=Math.min(1,640/Math.max(width,height));
  clip.width=Math.max(1,Math.round(width*scale));clip.height=Math.max(1,Math.round(height*scale));
  clip.getContext('2d').drawImage(capture,x,y,width,height,0,0,clip.width,clip.height);
  return clip.toDataURL('image/png');
}
function render(){
  $('count').textContent=records.size;$('clear').disabled=!records.size;
  if(!records.size){$('resultList').innerHTML=emptyResults;return;}
  $('resultList').replaceChildren();
  [...records.values()].reverse().forEach(record=>{
    const card=document.createElement('article');card.className='result';
    const top=document.createElement('div');top.className='result-top';
    const format=document.createElement('span');format.className='format';format.textContent=(formatNames[record.format]||record.format.replaceAll('_',' ')).toUpperCase();
    const time=document.createElement('time');time.dateTime=record.timestamp;time.textContent=new Date(record.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    top.append(format,time);const value=document.createElement('p');value.className='result-value';value.textContent=record.value;
    const copy=document.createElement('button');copy.textContent='Copy code';copy.setAttribute('aria-label',`Copy ${record.value}`);
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(record.value);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy code',1800);}catch{message('Copy is unavailable. Select the code text to copy it.',true);}};
    card.append(top);
    if(record.clip){const image=document.createElement('img');image.className='barcode-clip';image.src=record.clip;image.alt=`Captured barcode: ${record.value}`;card.append(image);}
    card.append(value,copy);$('resultList').append(card);
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
    clearTimeout(timeout);busy=false;if(data.id!==epoch||(!stream&&!imageMode))return;
    if(data.error){stopCamera();message('The barcode engine could not start. Reload the page and try again.',true);return;}
    if(paused)return;
    last=data.codes;draw(last,data.width,data.height);$('visibleCount').textContent=`${last.length} in ${imageMode?'image':'frame'}`;
    let changed=false;for(const code of last){if(!code.rawValue)continue;const key=JSON.stringify([code.format,code.rawValue]);if(!records.has(key)){records.set(key,{value:code.rawValue,format:code.format,timestamp:new Date().toISOString(),clip:barcodeClip(code)});changed=true;}}
    if(changed)render();
    if(imageMode){$('upload').disabled=false;$('upload').textContent='Upload image';status('Image scanned');message(last.length?`Found ${last.length} barcode${last.length===1?'':'s'} in the image. Unique codes and clips are in the list.`:'No barcodes found. Try a clearer image with the full barcode visible.');}
    else schedule();
  };
  worker.onerror=()=>{stopCamera();message('The scanner could not load. Reload the page to retry.',true);};
}
async function startCamera(){
  if(starting||stream)return;if(imageMode)stopCamera();starting=true;const request=++epoch;$('start').disabled=true;$('start').textContent='Starting camera…';status('Connecting');
  try{
    if(!window.isSecureContext)throw Object.assign(new Error(),{name:'InsecureContext'});
    if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error(),{name:'Unsupported'});
    const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}}});
    if(request!==epoch){next.getTracks().forEach(t=>t.stop());return;}
    stream=next;video.srcObject=stream;await video.play();
    if(request!==epoch)return;
    setupWorker();paused=false;$('cameraEmpty').hidden=true;$('liveHint').hidden=false;$('toggle').disabled=false;$('stop').disabled=false;
    $('toggle').querySelector('span').textContent='Pause';
    const track=stream.getVideoTracks()[0],caps=track.getCapabilities?.()||{};torch=track.getSettings?.().torch===true;updateTorch(!!caps.torch);
    const devices=await navigator.mediaDevices.enumerateDevices();if(request!==epoch)return;$('flip').disabled=devices.filter(d=>d.kind==='videoinput').length<2;
    track.onended=()=>{stopCamera();message('Camera disconnected. Start the camera to reconnect.',true);};
    status('Live',true);message('Scanning all visible codes. Results stay in this session.');schedule();
  }catch(error){
    if(request!==epoch)return;stopCamera();
    const errors={NotAllowedError:'Camera access was denied. Allow camera access in your browser settings, then try again.',NotFoundError:'No camera found. Open this page on a device with a camera.',NotReadableError:'Your camera is in use. Close other camera apps and try again.',InsecureContext:'Camera access requires HTTPS. Open the secure version of this page.',Unsupported:'This browser cannot access a camera. Try Safari or Chrome on your phone.'};
    message(errors[error.name]||'Could not start the camera. Check your camera permissions and try again.',true);
  }finally{if(request===epoch){starting=false;$('start').disabled=false;$('start').textContent='Start camera';}}
}
function stopCamera(){
  starting=false;$('start').disabled=false;$('start').textContent='Start camera';
  imageMode=false;if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}
  $('uploadedImage').hidden=true;$('uploadedImage').removeAttribute('src');$('cameraMode').hidden=true;
  $('upload').disabled=false;$('upload').textContent='Upload image';
  ++epoch;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;busy=false;
  stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;video.srcObject=null;paused=false;torch=false;last=[];draw();
  $('cameraEmpty').hidden=false;$('liveHint').hidden=true;for(const id of ['toggle','flip','torch','stop'])$(id).disabled=true;
  torchBusy=false;updateTorch();$('visibleCount').textContent='0 in frame';status('Camera off');
}
$('upload').onclick=()=>$('imageFile').click();
$('cameraMode').onclick=startCamera;
$('imageFile').onchange=async()=>{
  const file=$('imageFile').files?.[0];$('imageFile').value='';if(!file)return;
  if(file.size>20*1024*1024){message('Choose an image smaller than 20 MB.',true);return;}
  if(file.type&&!file.type.startsWith('image/')){message('Choose an image file, such as JPG, PNG or WebP.',true);return;}
  stopCamera();const request=epoch;imageMode=true;$('cameraMode').hidden=false;
  $('upload').disabled=true;$('upload').textContent='Scanning image…';status('Reading image');message('Reading your image on this device…');
  try{
    imageUrl=URL.createObjectURL(file);const img=new Image();img.src=imageUrl;await img.decode();
    if(request!==epoch)return;
    if(!img.naturalWidth||img.naturalWidth*img.naturalHeight>40000000)throw new Error('Image is too large. Choose an image under 40 megapixels.');
    const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
    capture.width=Math.max(1,Math.round(img.naturalWidth*scale));capture.height=Math.max(1,Math.round(img.naturalHeight*scale));
    captureCtx.fillStyle='white';captureCtx.fillRect(0,0,capture.width,capture.height);captureCtx.drawImage(img,0,0,capture.width,capture.height);
    $('uploadedImage').src=imageUrl;$('uploadedImage').hidden=false;$('cameraEmpty').hidden=true;status('Scanning image');
    setupWorker();const frame=captureCtx.getImageData(0,0,capture.width,capture.height);busy=true;
    worker.postMessage({id:request,frame},[frame.data.buffer]);
    timeout=setTimeout(()=>{if(request!==epoch)return;stopCamera();message('This image took too long to scan. Try a smaller image.',true);},30000);
  }catch(error){
    if(request!==epoch)return;stopCamera();message(error.message.startsWith('Image is too large')?error.message:'Could not read this image. Try a JPG, PNG or WebP file.',true);
  }
};
$('start').onclick=startCamera;
$('stop').onclick=()=>{stopCamera();message('Camera stopped. Your scanned codes are still here.');};
$('toggle').onclick=()=>{
  paused=!paused;$('toggle').querySelector('span').textContent=paused?'Resume':'Pause';status(paused?'Paused':'Live',!paused);
  if(paused){clearTimeout(timer);last=[];draw();$('visibleCount').textContent='Paused';message('Detection paused. Your camera preview is still on.');}
  else{message('Scanning all visible codes.');schedule();}
};
$('flip').onclick=async()=>{facing=facing==='environment'?'user':'environment';stopCamera();await startCamera();};
$('torch').onclick=async()=>{
  const track=stream?.getVideoTracks()[0],request=epoch;
  if(!track||torchBusy||!track.getCapabilities?.().torch)return;
  const desired=!torch;torchBusy=true;updateTorch(true);
  try{
    await track.applyConstraints({advanced:[{torch:desired}]});
    if(request!==epoch)return;
    const actual=track.getSettings?.().torch;
    torch=typeof actual==='boolean'?actual:desired;
    if(torch!==desired)message('Your browser could not change the flash setting.',true);
    else message(torch?'Flash is on.':'Flash is off.');
  }catch{
    if(request===epoch)message('This camera could not change the flash setting. Try again.',true);
  }finally{
    if(request===epoch){torchBusy=false;updateTorch(true);}
  }
};
$('clear').onclick=()=>{records.clear();render();message('Session results cleared.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||starting)){stopCamera();message('Camera stopped while the app was in the background. Tap Start camera to resume.');}});
window.addEventListener('pagehide',stopCamera);new ResizeObserver(()=>draw(last)).observe($('viewfinder'));
const lifecycle=new AbortController();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'get_scanned_codes',description:'Read the unique barcode values detected in the current session.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object');return {codes:[...records.values()].map(({clip,...record})=>({...record,hasClip:!!clip})),cameraActive:!!stream,paused};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}
window.addEventListener('pagehide',()=>lifecycle.abort());
