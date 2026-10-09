import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { readLegacyBarcodes, overlaps } from './legacy-reader.js';
import { normalizeCode } from './normalize-code.js';
prepareZXingModule({overrides:{locateFile:(path)=>new URL(path,self.location.href).href}});
const detector=new BarcodeDetector();
self.onmessage=async({data})=>{
  try {
    const codes=(await detector.detect(data.frame)).map(normalizeCode);
    const extra=readLegacyBarcodes(data.frame).filter(code=>!codes.some(known=>overlaps(code,known)));
    self.postMessage({id:data.id,codes:[...codes,...extra],width:data.frame.width,height:data.frame.height});
  }
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
