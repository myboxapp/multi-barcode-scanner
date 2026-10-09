import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
prepareZXingModule({overrides:{locateFile:(path)=>new URL(path,self.location.href).href}});
const detector=new BarcodeDetector();
self.onmessage=async({data})=>{
  try { const codes=await detector.detect(data.frame);self.postMessage({id:data.id,codes,width:data.frame.width,height:data.frame.height}); }
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
