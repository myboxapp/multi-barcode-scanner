// Uploaded photos get additional focused scans. Preserve source coordinates so
// annotations and result clips always refer to the original, unmodified frame.
export async function readImageDetails(frame,detector,existing=[]){
 const results=[...existing],{width,height}=frame;
 const add=(codes,x,y,scale)=>{
  for(const code of codes){
   const cornerPoints=code.cornerPoints.map(p=>({x:p.x/scale+x,y:p.y/scale+y}));
   const xs=cornerPoints.map(p=>p.x),ys=cornerPoints.map(p=>p.y);
   const left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
   const mapped={...code,cornerPoints,boundingBox:{x:left,y:top,width:right-left,height:bottom-top}};
   const duplicate=results.some(r=>{
    if(r.rawValue!==mapped.rawValue||r.format!==mapped.format)return false;
    const b=r.boundingBox;
    return Math.min(b.x+b.width,right)>=Math.max(b.x,left)-8&&Math.min(b.y+b.height,bottom)>=Math.max(b.y,top)-8;
   });
   if(!duplicate)results.push(mapped);
  }
 };
 const regions=[{x:0,y:0,w:width,h:height}];
 // Tall and wide bands handle both horizontal and vertical retail labels.
 for(const vertical of [false,true]){
  const length=vertical?width:height,size=Math.ceil(length*.28),step=Math.max(1,Math.floor(size*.5));
  for(let offset=0;offset<length;offset+=step){
   const start=Math.min(offset,length-size);
   regions.push(vertical?{x:start,y:0,w:size,h:height}:{x:0,y:start,w:width,h:size});
   if(start+size>=length)break;
  }
 }
 for(const {x,y,w,h} of regions){
  const scale=Math.min(2,3000/Math.max(w,h));
  const patch=new OffscreenCanvas(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
  const context=patch.getContext('2d',{willReadFrequently:true});
  // Put source pixels in a canvas without filtering, then resample the region.
  const source=new OffscreenCanvas(w,h),sourceContext=source.getContext('2d');
  sourceContext.putImageData(frame,-x,-y);context.drawImage(source,0,0,w,h,0,0,patch.width,patch.height);
  const pixels=context.getImageData(0,0,patch.width,patch.height);
  add(await detector.detect(pixels),x,y,scale);
  // Stretch the local luminance range, with a mild horizontal/vertical unsharp
  // filter. Checksums remain enforced by the decoder; no text is inferred.
  const gray=new Uint8Array(patch.width*patch.height),hist=new Uint32Array(256);
  for(let i=0;i<gray.length;i++){const v=(pixels.data[i*4]*77+pixels.data[i*4+1]*150+pixels.data[i*4+2]*29)>>8;gray[i]=v;hist[v]++;}
  let low=0,high=255,total=0;
  for(let i=0;i<256;i++){total+=hist[i];if(total>=gray.length*.02){low=i;break;}}
  total=0;for(let i=255;i>=0;i--){total+=hist[i];if(total>=gray.length*.02){high=i;break;}}
  const range=Math.max(30,high-low),pw=patch.width,ph=patch.height;
  for(let row=0;row<ph;row++)for(let col=0;col<pw;col++){
   const i=row*pw+col;
   const neighbors=(gray[row*pw+Math.max(0,col-1)]+gray[row*pw+Math.min(pw-1,col+1)]+gray[Math.max(0,row-1)*pw+col]+gray[Math.min(ph-1,row+1)*pw+col])/4;
   const value=Math.max(0,Math.min(255,(gray[i]+.7*(gray[i]-neighbors)-low)*255/range));
   pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=value;
  }
  add(await detector.detect(pixels),x,y,scale);
 }
 return results;
}
