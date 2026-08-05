const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const point=(x,y)=>({x:clamp(x,0,1),y:clamp(y,0,1)});
export function emptyMotionFrame(frame,timeSeconds){return {frame,timeSeconds,confidence:0,sourceColour:{red:255,green:255,blue:255},body:[],leftArm:[],rightArm:[],head:null,base:null};}
export function validateMotionFrame(f){return Boolean(f&&Number.isInteger(f.frame)&&Number.isFinite(f.timeSeconds)&&Number.isFinite(f.confidence)&&Array.isArray(f.body)&&Array.isArray(f.leftArm)&&Array.isArray(f.rightArm));}
export function extractMotionRig(mask,width,height,{frame=0,timeSeconds=0,sourceColour={red:255,green:90,blue:60},jointCount=8}={}){
 if(!mask||width<2||height<2||mask.length!==width*height)return emptyMotionFrame(frame,timeSeconds);
 const rows=[]; let pixels=0;
 for(let y=0;y<height;y++){let min=width,max=-1,count=0;for(let x=0;x<width;x++)if(mask[y*width+x]){min=Math.min(min,x);max=Math.max(max,x);count++;pixels++;}if(count)rows.push({y,min,max,count,cx:(min+max)/2});}
 if(rows.length<4||pixels<16)return emptyMotionFrame(frame,timeSeconds);
 const top=rows[0], bottom=rows.at(-1); const body=[];
 for(let i=0;i<jointCount;i++){const target=top.y+(bottom.y-top.y)*(i/(jointCount-1));const row=rows.reduce((a,b)=>Math.abs(b.y-target)<Math.abs(a.y-target)?b:a);body.push({...point(row.cx/(width-1),row.y/(height-1)),width:clamp((row.max-row.min+1)/width,0.02,0.5)});}
 const mid=rows[Math.floor(rows.length*.4)]; const branchRows=rows.filter(r=>r.y>=top.y+(bottom.y-top.y)*.18&&r.y<=top.y+(bottom.y-top.y)*.62);
 const leftTip=branchRows.reduce((a,r)=>r.min<a.min?r:a,branchRows[0]); const rightTip=branchRows.reduce((a,r)=>r.max>a.max?r:a,branchRows[0]);
 const shoulder=body[Math.min(3,body.length-1)];
 const mkArm=(tipX,tipY)=>[point(shoulder.x,shoulder.y),point((shoulder.x+tipX/(width-1))/2,(shoulder.y+tipY/(height-1))/2),point(tipX/(width-1),tipY/(height-1))];
 const confidence=clamp((pixels/(width*height))*.8+(rows.length/height)*.4,0,1);
 return {frame,timeSeconds,confidence,sourceColour,body,leftArm:mkArm(leftTip.min,leftTip.y),rightArm:mkArm(rightTip.max,rightTip.y),head:{...point(body[0].x,body[0].y),angle:Math.atan2(body[1].y-body[0].y,body[1].x-body[0].x)},base:point(body.at(-1).x,body.at(-1).y)};
}
export function smoothMotion(previous,current,amount=.7){if(!validateMotionFrame(current)||!current.body.length)return current;if(!previous?.body?.length)return current;const mix=(a,b)=>a*amount+b*(1-amount);const smoothPts=(a,b)=>b.map((p,i)=>a[i]?({...p,x:mix(a[i].x,p.x),y:mix(a[i].y,p.y),...(Number.isFinite(p.width)?{width:mix(a[i].width??p.width,p.width)}:{})}):p);return {...current,body:smoothPts(previous.body,current.body),leftArm:smoothPts(previous.leftArm,current.leftArm),rightArm:smoothPts(previous.rightArm,current.rightArm),base:{x:mix(previous.base.x,current.base.x),y:mix(previous.base.y,current.base.y)}};}
