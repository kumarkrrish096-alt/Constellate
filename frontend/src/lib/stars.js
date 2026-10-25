import {PAL} from './data'
export function makeStars(cv,env){const rgb=()=>PAL[env.theme()].ink;const c=cv.getContext('2d'),mq=matchMedia('(prefers-reduced-motion: reduce)');let W=0,H=0,T=0;
const S=[...Array(150)].map(()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.2+.35,p:Math.random()*6.3,v:.5+Math.random()*1.4,b:Math.random()<.12}));
const rs=()=>{const d=Math.min(2,devicePixelRatio||1);W=innerWidth;H=innerHeight;cv.width=W*d;cv.height=H*d;c.setTransform(d,0,0,d,0,0)};cv._rs=rs;addEventListener('resize',rs);rs();
return dt=>{if(!env.calm()&&!mq.matches)T+=dt;const g=rgb(),mx=env.theme()==='light'?.6:.85;c.clearRect(0,0,W,H);
S.forEach(s=>{const k=.5+.5*Math.sin(T*s.v+s.p),a=.1+(mx-.1)*k*k,x=s.x*W,y=s.y*H;c.fillStyle=`rgba(${g},${a})`;c.beginPath();c.arc(x,y,s.r*(.8+.4*k),0,6.3);c.fill();
if(s.b&&k>.55){c.strokeStyle=`rgba(${g},${a*.55})`;c.lineWidth=.7;const L=3+5*k;c.beginPath();c.moveTo(x-L,y);c.lineTo(x+L,y);c.moveTo(x,y-L);c.lineTo(x,y+L);c.stroke()}})}}
