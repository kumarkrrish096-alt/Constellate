const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const R=rng(145);
const F=['core','parser','graph','ui','api','cycle'];
const ST=[['index','types','config','utils','logger','errors','env','constants'],['lexer','tokens','ast','visitor','imports','calls','grammar','complexity'],['build','cluster','louvain','scc','store','edges','layout','walk'],['panel','atlas','search','toolbar','theme','modal','hooks','legend'],['router','routes','queue','jobs','sse','auth','github','limits']];
const N=[],E=[],C=[[],[],[],[],[],[]];
const add=(k,s)=>{const n={id:N.length,k,name:F[k]+'/'+s+'.ts',cx:0,ch:0,tok:0,out:[],inn:[]};N.push(n);C[k].push(n.id);return n.id};
for(let k=0;k<5;k++)for(let j=0;j<12;j++)add(k,j===0&&k===0?'god-file':ST[k][j%8]+(j>=8?'.util':''));
const god=0,ring=[];for(let i=0;i<5;i++)ring.push(add(5,['entry','loader','merge','emit','sync'][i]));
const link=(a,b,cy)=>{if(a!==b&&!E.some(e=>e.a===a&&e.b===b))E.push({a,b,cy:!!cy,i:E.length})};
for(let k=0;k<5;k++)C[k].forEach((id,j)=>{if(j>0){link(id,C[k][Math.floor(R()*j)]);if(R()<.35)link(id,C[k][Math.floor(R()*j)])}});
N.forEach(n=>{if(n.id!==god&&n.k<5&&R()<.3)link(n.id,god)});
for(let k=0;k<5;k++)for(let t=0;t<2;t++)link(C[k][1+Math.floor(R()*11)],C[(k+1+Math.floor(R()*3))%5][Math.floor(R()*12)]);
ring.forEach((id,i)=>link(id,ring[(i+1)%5],true));
link(ring[0],C[2][3]);link(C[2][5],ring[2]);link(C[4][4],ring[0]);
E.forEach(e=>{N[e.a].out.push(e.b);N[e.b].inn.push(e.a)});
const CO=[],R2=rng(99);while(CO.length<16){const a=Math.floor(R2()*N.length),b=Math.floor(R2()*N.length);if(a!==b&&!E.some(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a))&&!CO.some(c=>(c.a===a&&c.b===b)||(c.a===b&&c.b===a)))CO.push({a,b,w:3+Math.floor(R2()*14)})}
N.forEach(n=>{n.cx=Math.round(3+R()*14+n.inn.length*1.6);n.ch=Math.round(5+R()*55);n.tok=n.cx*38+Math.floor(R()*400)});
N[god].cx=58;N[god].ch=94;ring.forEach(i=>{N[i].cx=14+Math.floor(R()*14);N[i].ch=40+Math.floor(R()*30)});
const reach=(i,key)=>{const s=new Set(),q=[i];while(q.length){const x=q.pop();N[x][key].forEach(y=>{if(!s.has(y)&&y!==i){s.add(y);q.push(y)}})}return s};
N.forEach(n=>{n.fwd=reach(n.id,'out');n.rev=reach(n.id,'inn');n.bl=n.rev.size;n.risk=Math.min(1,n.cx/58)*.5+n.ch/100*.5;n.h=100-Math.round(n.risk*100)});
const maxB=Math.max(...N.map(n=>n.bl)),cyc=new Set(ring);
const PAL={dark:{cl:['#EADFC8','#C4202E','#BBA995','#FF3B30','#D98A84','#E8626C'],ink:'234,223,200',gr:'196,32,46',gold:'#B8323A',hot:'#FF3B30',bgc:'14,6,7'},light:{cl:['#1A1210','#8B0F1A','#4A3A33','#B0161F','#6B4A3F','#C4202E'],ink:'26,18,16',gr:'139,15,26',gold:'#7A1620',hot:'#B0161F',bgc:'232,220,196'}}; 
const U=N.map(()=>({x:0,y:0,vx:0,vy:0}));
(()=>{const L=rng(11),g=()=>L()+L()+L()-1.5,Cc=[[0,0]];for(let k=1;k<=5;k++){const a=(k-1)/5*Math.PI*2-Math.PI/2;Cc.push([Math.cos(a)*.64,Math.sin(a)*.64])}
N.forEach((n,i)=>{U[i].x=Cc[n.k][0]+g()*.3;U[i].y=Cc[n.k][1]+g()*.3});
for(let it=0;it<300;it++){for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){const dx=U[i].x-U[j].x,dy=U[i].y-U[j].y,d2=Math.max(dx*dx+dy*dy,.0015),d=Math.sqrt(d2),f=.00018/d2;U[i].vx+=dx/d*f;U[i].vy+=dy/d*f;U[j].vx-=dx/d*f;U[j].vy-=dy/d*f}
E.forEach(e=>{const a=U[e.a],b=U[e.b],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.01,f=(d-.08)*.05;a.vx+=dx/d*f;a.vy+=dy/d*f;b.vx-=dx/d*f;b.vy-=dy/d*f});
N.forEach((n,i)=>{const u=U[i];u.vx+=(Cc[n.k][0]-u.x)*.03;u.vy+=(Cc[n.k][1]-u.y)*.03;u.vx*=.8;u.vy*=.8;u.x=Math.max(-.95,Math.min(.95,u.x+Math.max(-.03,Math.min(.03,u.vx))));u.y=Math.max(-.95,Math.min(.95,u.y+Math.max(-.03,Math.min(.03,u.vy))))})}})();
const issues=['Add missing JSDoc to exported helpers','Rename unclear variable in config loader','Fix typo in error message','Add unit test for edge case','Improve log message formatting','Replace deprecated call','Document the env variables','Tidy unused imports'];
const cand=N.filter(n=>n.id!==god&&!cyc.has(n.id)&&n.inn.length>0).map(n=>({n,sf:100-Math.round((n.bl/maxB*.45+n.cx/58*.3+n.ch/100*.25)*100),t:R()>.45})).sort((a,b)=>b.sf-a.sf).slice(0,8).map((c,i)=>({...c,iss:issues[i],no:1200+Math.floor(R()*700)}));
const worst=N.slice().sort((a,b)=>b.risk-a.risk)[0];
const seedH=()=>{const H=3600e3,D=24*H,n=Date.now();return[
{id:1,n:'expressjs/express',s:'a3f9c1e',l:'JavaScript',f:142,h:81,cy:1,g:1,st:'cached',ms:240,at:n-2*H},
{id:2,n:'vitejs/vite',s:'91d4e07',l:'TypeScript',f:612,h:72,cy:3,g:2,st:'cast',ms:4180,at:n-5*H},
{id:3,n:'vuejs/core',s:'7be21d0',l:'TypeScript',f:1204,h:68,cy:4,g:3,st:'cast',ms:4890,at:n-26*H},
{id:4,n:'facebook/react',s:'',l:'JavaScript',f:0,h:0,cy:0,g:0,st:'fizzled',ms:0,at:n-30*H,note:'GitHub rate limit reached. The job waits in the queue and retries after the reset.'},
{id:5,n:'pallets/flask',s:'c04d8aa',l:'Python',f:86,h:86,cy:0,g:0,st:'cast',ms:1260,at:n-3*D},
{id:6,n:'torvalds/linux',s:'e1f07bb',l:'C',f:20000,h:41,cy:12,g:6,st:'partial',ms:88000,at:n-4*D,note:'The 20,000 file cap was reached. Three top-level packages were skipped.'},
{id:7,n:'vuejs/core',s:'2c8a5f1',l:'TypeScript',f:1181,h:66,cy:5,g:3,st:'cast',ms:4720,at:n-9*D}]};
export {rng,R,F,N,E,C,CO,god,ring,cyc,maxB,PAL,U,issues,cand,worst,seedH}
