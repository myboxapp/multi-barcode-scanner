// Supplemental linear readers. Encoding tables follow BWIPP (MIT), credited
// in dist/THIRD-PARTY-NOTICES.txt. Values are preserved, including optional
// check digits: their presence cannot safely be inferred from a symbol alone.
const digits='0123456789';
const industrial=['1111313111','3111111131','1131111131','3131111111','1111311131','3111311111','1131311111','1111113131','3111113111','1131113111'];
const matrix=['113311','311131','131131','331111','113131','313111','133111','111331','311311','131311'];
const definitions=[
 {format:'code_11',start:'113311',stop:'11331',chars:digits+'-',patterns:['111131','311131','131131','331111','113131','313111','133111','111331','311311','311111','113111']},
 {format:'industrial_2_of_5',start:'313111',stop:'31113',chars:digits,patterns:industrial},
 {format:'iata_2_of_5',start:'1111',stop:'311',chars:digits,patterns:industrial},
 {format:'matrix_2_of_5',start:'311111',stop:'31111',chars:digits,patterns:matrix},
 {format:'msi_plessey',start:'21',stop:'121',chars:digits,patterns:['12121212','12121221','12122112','12122121','12211212','12211221','12212112','12212121','21121212','21121221']},
];
// Fit measured runs to the narrow/wide pattern. Both per-element error and
// average error are bounded, and module width stays consistent across a code.
function fit(runs,index,pattern,ratio,reference){
 if(index+pattern.length>runs.length)return null;
 let pp=0,ps=0,pw=0,sw=0;
 for(let k=0;k<pattern.length;k++){const p=pattern[k]==='1'?1:ratio,s=k%2?-1:1,w=runs[index+k].width;pp+=p*p;ps+=p*s;pw+=p*w;sw+=s*w;}
 const count=pattern.length,denominator=pp*count-ps*ps;
 const unit=(pw*count-sw*ps)/denominator,bias=(sw*pp-pw*ps)/denominator;
 if(unit<.85||Math.abs(bias)>unit*.65||reference&&(unit<reference*.7||unit>reference*1.3))return null;
 let error=0;
 for(let k=0;k<pattern.length;k++){const delta=Math.abs((runs[index+k].width-bias*(k%2?-1:1))/unit-(pattern[k]==='1'?1:ratio));if(delta>.7)return null;error+=delta;}
 return error/pattern.length<.27?{unit,error:error/pattern.length}:null;
}
function decodeRuns(runs){
 const found=[];
 for(let start=1;start<runs.length-25;start++){
  if(!runs[start].black||runs[start-1].width<5)continue;
  for(const def of definitions){
   for(const ratio of def.format==='msi_plessey'?[2]:[2,2.5,3]){
    const initial=fit(runs,start,def.start,ratio);if(!initial||runs[start-1].width<initial.unit*6)continue;
    let pos=start+def.start.length,value='';
    while(pos<runs.length&&value.length<=100){
     const stop=fit(runs,pos,def.stop,ratio,initial.unit);
     const end=pos+def.stop.length;
     if(value.length>=3&&stop&&end<runs.length&&!runs[end].black&&runs[end].width>=initial.unit*6){
      found.push({format:def.format,rawValue:value,start:runs[start].start,end:runs[end].start});break;
     }
     let best=null;
     for(let n=0;n<def.patterns.length;n++){const match=fit(runs,pos,def.patterns[n],ratio,initial.unit);if(match&&(!best||match.error<best.error))best={...match,n};}
     if(!best)break;value+=def.chars[best.n];pos+=def.patterns[best.n].length;
    }
   }
  }
 }
 return found;
}
function toRuns(gray){
 // Local contrast windows tolerate uneven lighting without inventing edges in
 // near-flat areas. White margins are retained for quiet-zone validation.
 const runs=[];let black=false,start=0;
 const block=64,thresholds=[];
 for(let x=0;x<gray.length;x+=block){let lo=255,hi=0;for(let j=x;j<Math.min(x+block,gray.length);j++){lo=Math.min(lo,gray[j]);hi=Math.max(hi,gray[j]);}thresholds.push(hi-lo<35?128:(lo+hi)/2);}
 for(let x=0;x<=gray.length;x++){
  const next=x<gray.length&&gray[x]<thresholds[Math.floor(x/block)];
  if(next!==black||x===gray.length){if(x>start)runs.push({black,start,width:x-start});start=x;black=next;}
 }
 return runs;
}
export function readLegacyBarcodes(frame){
 const {width,height,data}=frame,gray=new Uint8Array(width*height);
 for(let i=0;i<gray.length;i++)gray[i]=(data[i*4]*77+data[i*4+1]*150+data[i*4+2]*29)>>8;
 const results=[];
 // Scan both directions at twelve angles. A code must agree on three separate
 // parallel lines before it is emitted. Positions belong to each physical
 // symbol, so two copies of the same value still receive separate outlines.
 for(const angle of Array.from({length:12},(_,i)=>i*Math.PI/12)){
  const ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
  const corners=[[0,0],[width-1,0],[0,height-1],[width-1,height-1]];
  const us=corners.map(([x,y])=>x*ux+y*uy),vs=corners.map(([x,y])=>x*vx+y*vy);
  const u0=Math.floor(Math.min(...us))-12,u1=Math.ceil(Math.max(...us))+12,v0=Math.min(...vs),v1=Math.max(...vs);
  const step=Math.max(3,Math.floor(Math.min(width,height)/180)),groups=[];
  for(let v=v0;v<=v1;v+=step){
   const line=new Uint8Array(u1-u0+1);line.fill(255);
   for(let i=0;i<line.length;i++){const u=u0+i,x=Math.round(u*ux+v*vx),y=Math.round(u*uy+v*vy);if(x>=0&&y>=0&&x<width&&y<height)line[i]=gray[y*width+x];}
   const hits=[...decodeRuns(toRuns(line)).map(h=>({...h,start:h.start+u0,end:h.end+u0})),...decodeRuns(toRuns(line.slice().reverse())).map(h=>({...h,start:u1-h.end,end:u1-h.start}))];
   for(const hit of hits){
    let group=groups.find(g=>g.format===hit.format&&g.rawValue===hit.rawValue&&Math.abs(g.lastStart-hit.start)<12&&Math.abs(g.lastEnd-hit.end)<12&&v-g.maxV<=step*3);
    if(!group){group={...hit,minV:v,maxV:v,lines:new Set()};groups.push(group);}
    group.lastStart=hit.start;group.lastEnd=hit.end;group.start=Math.min(group.start,hit.start);group.end=Math.max(group.end,hit.end);group.maxV=v;group.lines.add(v);
   }
  }
  for(const group of groups){
   if(group.lines.size<3||group.maxV-group.minV<step*2)continue;
   const point=(u,v)=>({x:Math.max(0,Math.min(width-1,u*ux+v*vx)),y:Math.max(0,Math.min(height-1,u*uy+v*vy))});
   const points=[point(group.start,group.minV-step/2),point(group.end,group.minV-step/2),point(group.end,group.maxV+step/2),point(group.start,group.maxV+step/2)];
   const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),right=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.y));
   const result={format:group.format,rawValue:group.rawValue,cornerPoints:points,boundingBox:{x,y,width:right-x,height:bottom-y}};
   const existing=results.find(r=>r.rawValue===result.rawValue&&r.format===result.format&&overlaps(r,result));
   if(!existing)results.push(result);
   else if(result.boundingBox.width*result.boundingBox.height>existing.boundingBox.width*existing.boundingBox.height)Object.assign(existing,result);
  }
 }
 return results;
}
export function overlaps(a,b){
 const x=a.boundingBox,y=b.boundingBox;
 const area=Math.max(0,Math.min(x.x+x.width,y.x+y.width)-Math.max(x.x,y.x))*Math.max(0,Math.min(x.y+x.height,y.y+y.height)-Math.max(x.y,y.y));
 return area>Math.min(x.width*x.height,y.width*y.height)*.4;
}
