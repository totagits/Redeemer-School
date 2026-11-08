function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
export function schoolPaletteReport(branding){
  const colors=[branding.primaryColor,branding.secondaryColor||branding.primaryColor,branding.accentColor];
  if(!colors.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)))return {valid:false,primary:0,secondary:0,accent:0,navigation:0};
  const result={primary:contrast(colors[0],'#ffffff'),secondary:contrast(colors[1],'#ffffff'),accent:contrast(colors[2],'#020617'),navigation:contrast(colors[0],colors[2])};
  return {...result,valid:Object.values(result).every(n=>n>=4.5)};
}
