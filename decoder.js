import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { readLegacyBarcodes, overlaps } from './legacy-reader.js';
import { normalizeCode } from './normalize-code.js';
import { readImageDetails } from './detail-reader.js';
prepareZXingModule({overrides:{locateFile:(path)=>new URL(path,self.location.href).href}});
const detector=new BarcodeDetector();
self.onmessage=async({data})=>{
  try {
    let detected=await detector.detect(data.frame);
    if(data.detailed)detected=await readImageDetails(data.frame,detector,detected);
    const codes=detected.map(normalizeCode);
    const extra=readLegacyBarcodes(data.frame).filter(code=>!codes.some(known=>overlaps(code,known)));
    self.postMessage({id:data.id,codes:[...codes,...extra],width:data.frame.width,height:data.frame.height});
  }
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
