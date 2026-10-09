// ZXing exposes some retail symbols as their expanded EAN-13 representation.
// Return the familiar printed UPC value, retaining every significant zero.
export function normalizeCode(code){
 if(code.format==='ean_13'&&/^0\d{12}$/.test(code.rawValue))return {...code,format:'upc_a',rawValue:code.rawValue.slice(1)};
 if(code.format==='upc_e'){
  const a=code.rawValue.length===13&&code.rawValue.startsWith('0')?code.rawValue.slice(1):code.rawValue;
  if(/^[01]\d{11}$/.test(a)){
   const n=a[0],m=a.slice(1,6),p=a.slice(6,11),check=a[11];let compact;
   if(/^[012]00$/.test(m.slice(2))&&p.startsWith('00'))compact=m.slice(0,2)+p.slice(2)+m[2];
   else if(m.endsWith('00')&&p.startsWith('000'))compact=m.slice(0,3)+p.slice(3)+'3';
   else if(m.endsWith('0')&&p.startsWith('0000'))compact=m.slice(0,4)+p[4]+'4';
   else if(p.startsWith('0000')&&Number(p[4])>=5)compact=m+p[4];
   if(compact)return {...code,rawValue:n+compact+check};
  }
 }
 return code;
}
