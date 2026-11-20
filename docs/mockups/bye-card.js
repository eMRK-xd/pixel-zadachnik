/* mockup: the "А как же ваши задачи?" card. Purple card: the chosen skin on top (3× detail, the pupil follows the mouse / gyroscope),
   the question, today's done/total in the middle, two buttons with rolled captions. Stays until you pick a button. */
(()=>{
  document.getElementById("byeCss")?.remove();
  document.head.insertAdjacentHTML("beforeend",`<style id="byeCss">
.byew{position:fixed;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;background:#0007;animation:byeFade .16s steps(3);overflow:hidden}
.byep{--c:#5b3f8f;position:relative;z-index:1;width:min(260px,74vw);aspect-ratio:63/88;background:#251843;padding:22px 12px 22px;display:flex;flex-direction:column;align-items:center;
  filter:drop-shadow(6px 8px 0 rgba(0,0,0,.7));animation:byeIn .24s steps(4)}
.byep .art{display:flex;justify-content:center;margin-bottom:auto}
.byep svg{image-rendering:pixelated;shape-rendering:crispEdges}
.byep b{color:#f3d48a;font-size:17px;text-align:center;margin:6px 0 0}
.byep b{margin-top:auto}
.byep .fr{text-align:center;color:#e0b13e;font-size:22px;letter-spacing:1px;margin:10px 0 2px}
.byep .fr small{display:block;color:var(--dim);font-size:11px;letter-spacing:0}
.byep .act{display:flex;gap:10px;margin-top:12px;width:100%;justify-content:center}
.byep .act .btn{margin:4px;padding:6px 8px;font-size:12px;line-height:1.15;flex:1;max-width:116px;min-height:40px;box-shadow:0 calc(-1*var(--px)) 0 0 var(--c),0 var(--px) 0 0 var(--c),calc(-1*var(--px)) 0 0 0 var(--c),var(--px) 0 0 0 var(--c),4px 8px 0 0 #0009}
.byep .act .btn:active{transform:translate(2px,3px);box-shadow:0 calc(-1*var(--px)) 0 0 var(--c),0 var(--px) 0 0 var(--c),calc(-1*var(--px)) 0 0 0 var(--c),var(--px) 0 0 0 var(--c),2px 4px 0 0 #0009}
.byeh{position:relative;z-index:1}
.byeh .note{position:absolute;right:2px;top:100%;margin-top:16px;color:#fff;font-size:12px;white-space:nowrap;text-shadow:2px 2px 0 #000}
.byeh .note:empty{display:none}
.byep .wh i{font-style:italic}
.byep .scr{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.byep svg.chalk{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;image-rendering:pixelated;shape-rendering:crispEdges}
.byep[data-chalk]{cursor:crosshair}.byep[data-chalk] button{cursor:pointer}
.byep>*:not(.scr):not(.chalk){position:relative;z-index:1}
.byep .wh{color:#3e2d66;font-size:12px;text-align:center;margin:14px 4px 0;line-height:1.25;min-height:15px}
.byep .act .btn.spin{animation:roll .45s steps(6)}
@keyframes roll{0%{transform:rotateX(0)}50%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
.bird{position:absolute;z-index:0;image-rendering:pixelated;animation:fly var(--d) linear forwards}
@keyframes fly{from{transform:translate(0,0)}to{transform:translate(var(--dx),var(--dy))}}
.byew.out{animation:byeOut .18s steps(3) forwards}
@keyframes byeFade{from{background:#0000}}
@keyframes byeIn{from{transform:scale(.6);opacity:0}to{transform:none;opacity:1}}
@keyframes byeOut{to{opacity:0}}
</style>`);
  const K=3;
  const bigEye=(k,cell)=>{const sk=skinOf(k),g=sk.g,W=g[0].length*K,H=g.length*K;
    let v=`<svg width="${W*cell}" height="${H*cell}" viewBox="0 0 ${W} ${H}">`;
    g.forEach((r,y)=>[...r].forEach((c,x)=>{const col=sk.pal?.[c]||(c==="X"?sk.body:c==="o"?sk.acc:null);if(col)v+=`<rect x="${x*K}" y="${y*K}" width="${K}" height="${K}" fill="${col}"/>`}));
    (sk.eyes||[[5,4]]).forEach(([x,y])=>v+=`<rect class="bp" data-x="${x*K}" data-y="${y*K}" x="${x*K}" y="${y*K}" width="${(sk.pw||1)*K}" height="${(sk.ph||1)*K}" fill="${sk.pupil}"/>`);
    return v+"</svg>"};

  /* captions come from web/captions.json (easy to edit); a tiny built-in set if it can't be read */
  let CAP={pairChance:.2,stay:["к задачам"],go:["спрятать"],pairs:[],whisper:[""],rare:[]};
  const ready=fetch("captions.json",{cache:"no-cache"}).then(r=>r.json()).then(j=>{CAP={...CAP,...j}}).catch(()=>{});
  const pickOf=a=>a[Math.floor(Math.random()*a.length)];
  const txt=x=>typeof x==="string"?{text:x}:x;
  const roll=force=>{
    for(const e of CAP.rare||[])if(force==="rare"||(!force&&Math.random()<e.chance))return{stay:e.stay||txt(pickOf(CAP.stay)).text,go:e.go,fx:e.fx,url:e.url,reroll:e.fx==="reroll"};
    if(CAP.pairs.length&&(force==="pair"||!force)&&(force==="pair"||Math.random()<CAP.pairChance)){const p=pickOf(CAP.pairs);return{stay:p.stay,go:p.go,note:p.note,fx:p.fx}}
    if(force==="feather"){window.__forceFeather=true;const st=txt(pickOf(CAP.stay));return{stay:st.text,go:"я свободен",fx:"birds"}}
    if(force==="tally"){const st=txt(pickOf(CAP.stay));return{stay:st.text,go:"выпустите",fx:"tally"}}
    const st=txt(pickOf(CAP.stay)),g=force==="free"?(CAP.go.map(txt).find(x=>x.fx==="birds")||txt(pickOf(CAP.go))):txt(pickOf(CAP.go));
    return{stay:st.text,go:g.text,fx:g.fx||st.fx}};
  /* captions may use \n for a line break and *word* for italics */
  const fmt=t=>String(t||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/\*([^*]+)\*/g,"<i>$1</i>").replace(/\n/g,"<br>");
  /* prison tally marks ("выпустите"): pixel lines, slightly leaning, struck through */
  /* F: the owner's sketch — marks on the wall (one per task of today, finished ones struck in fours), of slightly different lengths;
     at most 5 groups in the row, the last mark trails a thin chalk line down to a piece of chalk on a little windowsill.
     Extra groups get stuck all over the card (bottom → top), almost the card's colour so text stays readable. Pure pixels. */
  const ROWG=5;
  const marksToday=()=>{const today=new Date().toDateString(),open=S.tasks.filter(t=>!t.done).length,
      done=[...S.tasks,...(S.archive||[])].filter(t=>t.done&&t.doneAt&&new Date(t.doneAt).toDateString()===today).length,
      total=Math.max(1,Math.min(200,done+open));return{total,dn:Math.min(done,total)}};
  const groupPx=(P,gx,gy,n,doneN,dim,lit)=>{const gap=3;let last=[gx,gy];
    for(let i=0;i<n;i++){const isDone=i<doneN,x=gx+i*gap,mh=8+Math.floor(Math.random()*5),top=gy+(12-mh)-Math.floor(Math.random()*2); // different lengths
      for(let y=0;y<mh;y++)P(x+(y<4?1:0),top+y,isDone?lit:dim);last=[x,top+mh-1]}
    if(doneN===4)for(let k=0;k<=4*gap+2;k++)P(gx-2+k,gy+10-Math.round(k*7/(4*gap+2)),lit);
    return last};
  const chalkWall=()=>{const{total,dn}=marksToday(),rowN=Math.min(total,ROWG*4);
    const W=104,H=32,px=[],P=(x,y,c)=>{if(x>=0&&y>=0&&x<W&&y<H)px.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`)};
    const dim="#46356f",lit="#7a64b8",chalk="#e8dfc8",dust="#5c4a92",sill="#4a3978",sillD="#120a20";
    const groups=Math.ceil(rowN/4),gw=17,x0=Math.max(1,Math.round((W-(groups*gw-5))/2));let lastX=0,lastY=0;
    for(let g=0;g<groups;g++){const n=Math.min(4,rowN-g*4);[lastX,lastY]=groupPx(P,x0+g*gw,1+((g*7)%3),n,Math.max(0,Math.min(n,dn-g*4)),dim,lit)}
    const sy=H-5,cx=Math.min(W-8,lastX+14);
    for(let x=3;x<W-3;x++){P(x,sy,sill);P(x,sy+1,sill);P(x,sy+2,sillD)}
    for(let y=lastY+1;y<sy-2;y++){const t=(y-lastY)/(sy-2-lastY),x=Math.round(lastX+(cx-lastX)*t*t);if(y%2||t>.6)P(x,y,dust)}
    for(let x=cx-2;x<cx+3;x++){P(x,sy-2,chalk);P(x,sy-1,chalk)}P(cx+3,sy-1,"#b9ad8e");
    return `<svg width="${W*2}" height="${H*2}" viewBox="0 0 ${W} ${H}" style="image-rendering:pixelated;shape-rendering:crispEdges">${px.join("")}</svg>`};
  /* draw with chalk anywhere on the card (over the eye too) with a finger or the mouse; buttons still work.
     Chalk sits on a 2-px grid like the rest of the pixel art; tiny crumbs fall off the stroke. */
  function chalkDraw(card){if(!card||card.dataset.chalk)return;card.dataset.chalk=1;
    const CELL=2,q0=card.getBoundingClientRect(),W=Math.ceil(q0.width/CELL),H=Math.ceil(q0.height/CELL);
    card.insertAdjacentHTML("beforeend",`<svg class="chalk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>`);
    const svg=card.querySelector("svg.chalk"),seen=new Map();let mode="chalk";
    const NS="http://www.w3.org/2000/svg";
    const put=(x,y)=>{if(mode==="sponge"){for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++){const k=(x+i)+","+(y+j),r=seen.get(k);if(r){r.remove();seen.delete(k)}}return}  // the sponge wipes only your chalk
      if(x<0||y<0||x>=W||y>=H||seen.has(x+","+y))return;const r=document.createElementNS(NS,"rect");
      r.setAttribute("x",x);r.setAttribute("y",y);r.setAttribute("width",1);r.setAttribute("height",1);r.setAttribute("fill","#b3a4e0");svg.appendChild(r);seen.set(x+","+y,r)};
    const cell=e=>{const q=card.getBoundingClientRect();return[Math.floor((e.clientX-q.left)/q.width*W),Math.floor((e.clientY-q.top)/q.height*H)]};
    const crumb=e=>{if(Math.random()<.55)return;const c=document.createElement("i");
      c.style.cssText=`position:fixed;left:${e.clientX+(Math.random()*6-3)}px;top:${e.clientY}px;width:2px;height:2px;background:${mode==="sponge"?"#8a7bb0":"#e8dfc8"};z-index:7;pointer-events:none;opacity:.8;transition:transform .5s ease-in,opacity .5s`;
      document.body.appendChild(c);requestAnimationFrame(()=>{c.style.transform=`translate(${Math.random()*6-3}px,${8+Math.random()*12}px)`;c.style.opacity="0"});setTimeout(()=>c.remove(),550)};
    let prev=null;card.style.touchAction="none";
    card.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;e.preventDefault();card.setPointerCapture(e.pointerId);prev=cell(e);put(...prev);crumb(e)});
    card.addEventListener("pointermove",e=>{if(!prev)return;const[x1,y1]=cell(e);let[x0,y0]=prev;
      const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let er=dx+dy;
      for(let n=0;n<400;n++){put(x0,y0);if(x0===x1&&y0===y1)break;const e2=2*er;if(e2>=dy){er+=dy;x0+=sx}if(e2<=dx){er+=dx;y0+=sy}}
      if(x1!==prev[0]||y1!==prev[1])crumb(e);prev=[x1,y1]});
    const w0=()=>card.closest(".byew")||{};
    const up=()=>{if(prev)w0()._noClick=performance.now();prev=null};card.addEventListener("pointerup",up);card.addEventListener("pointercancel",up);
    const wh=card.querySelector(".wh"),wall=wh?.querySelector("svg");if(!wall)return;
    const SP=["GGGGGGGG","YYoYYYoY","YoYYYYYo","YYYYoYYY"],spSvg=`<svg width="16" height="8" viewBox="0 0 8 4" style="display:block;image-rendering:pixelated;shape-rendering:crispEdges">${SP.map((r,y)=>[...r].map((c,x)=>`<rect x="${x}" y="${y}" width="1" height="1" fill="${c==="G"?"#4f8a3a":c==="o"?"#a8832a":"#d9b24a"}"/>`).join("")).join("")}</svg>`;
    const wr=wall.getBoundingClientRect(),hr=wh.getBoundingClientRect(),sillTop=wr.top-hr.top+(wall.viewBox.baseVal.height-5)*2;
    wh.style.position="relative";
    wh.insertAdjacentHTML("beforeend",`<button class="sponge" title="Зажми губку и сотри свои рисунки" style="position:absolute;cursor:grab;left:${wr.left-hr.left+12}px;top:${sillTop-8}px;padding:0;border:0;background:none;cursor:pointer;transition:transform .12s steps(2)">${spSvg}</button>`);
    const sp=wh.querySelector(".sponge");sp.style.touchAction="none";
    // carry the sponge: press it, drag it over the card — it wipes your chalk under it; let go and it slides back onto the sill
    sp.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();mode="sponge";document.querySelectorAll(".sponge-fly").forEach(f=>f.remove());SFX.play("pick");
      const home=sp.getBoundingClientRect(),fl=sp.cloneNode(true);fl.className="sponge-fly";
      // the copy needs its own "no background / no border" or the browser paints a white button under it
      fl.style.cssText=`position:fixed;z-index:8;pointer-events:none;padding:0;border:0;background:none;margin:0;left:${e.clientX-8}px;top:${e.clientY-4}px;transform:scale(1.5) rotate(-8deg);transition:none`;
      document.body.appendChild(fl);sp.style.visibility="hidden";prev=cell(e);put(...prev);
      let lx=e.clientX,ly=e.clientY;const trail=[{x:lx,y:ly,t:performance.now()}];
      const mv=ev=>{lx=ev.clientX;ly=ev.clientY;const now=performance.now();trail.push({x:lx,y:ly,t:now});while(trail.length>2&&now-trail[0].t>90)trail.shift();
        fl.style.left=ev.clientX-8+"px";fl.style.top=ev.clientY-4+"px";const[x1,y1]=cell(ev);let[x0,y0]=prev;
        const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let er=dx+dy;
        for(let n=0;n<400;n++){put(x0,y0);if(x0===x1&&y0===y1)break;const e2=2*er;if(e2>=dy){er+=dy;x0+=sx}if(e2<=dx){er+=dx;y0+=sy}}
        if(x1!==prev[0]||y1!==prev[1])crumb(ev);prev=[x1,y1]};
      const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);removeEventListener("pointercancel",up);prev=null;mode="chalk";
        // throw speed from the last ~90 ms of movement (px per frame); slow moves don't throw, upward throws get a small lift
        const a=trail[0],b=trail[trail.length-1],dt=Math.max(16,b.t-a.t),k=16.7/dt;let vx=(b.x-a.x)*k,vy=(b.y-a.y)*k;
        const sp2=Math.hypot(vx,vy);if(sp2<3){vx=0;vy=0}else{const f=(sp2-3)/sp2;vx*=f;vy*=f}        // a dead zone: gentle moves just drop it
        if(vy<0)vy*=1.25;vx=Math.max(-18,Math.min(18,vx));vy=Math.max(-22,Math.min(14,vy));
        w0()._noClick=performance.now();dropSponge(fl,home,lx-8,ly-4,vx,vy)};
      addEventListener("pointermove",mv);addEventListener("pointerup",up);addEventListener("pointercancel",up)});
    /* let go of the sponge: it falls. Lands on the sill → slides home. Misses → drops onto an invisible floor under the card,
       the eye stares at it (pupil 4×4) and pulls it back along an arc. Going for the hide button breaks the spell: it falls again. */
    const sp0=parseFloat(sp.style.left);                                                       // the sponge's original spot
    const sillSpot=x=>{const wr=wall.getBoundingClientRect(),hr=wh.getBoundingClientRect();return Math.max(wr.left+2,Math.min(wr.right-18,x))-hr.left};  // left inside .wh
    const settle=(fl,x)=>{sp.style.left=sillSpot(x)+"px";fl.remove();sp.style.visibility=""};
    function dropSponge(fl,home,x,y,vx,vy){let rot=-8;const gaze=()=>card.closest(".byew")?._gaze;
      const step=()=>{if(!fl.isConnected)return;
        const wr=wall.getBoundingClientRect(),sillY=wr.top+(wall.viewBox.baseVal.height-5)*2,cr=card.getBoundingClientRect(),floor=innerHeight+30;                 // past the bottom of the screen
        const by=y+8;vy=Math.min(vy+.32,11);vx*=.985;x+=vx;y+=vy;rot+=vx*1.5;
        if(by<=sillY&&y+8>=sillY&&x+8>wr.left+4&&x+8<wr.right-4){settle(fl,x);return}            // caught by the sill: it stays where it landed
        if(y>=floor||x<-40||x>innerWidth+24){fl.style.left=x+"px";fl.style.top=y+"px";setTimeout(()=>pull(fl,home,x,y),450);return}  // gone off screen, any side
        fl.style.left=x+"px";fl.style.top=y+"px";fl.style.transform=`rotate(${rot.toFixed(0)}deg)`;requestAnimationFrame(step)};
      fl.style.transition="none";requestAnimationFrame(step)}
    function pull(fl,home0,x,y){const g=card.closest(".byew")?._gaze;if(!fl.isConnected||!g)return;
      const hr=wh.getBoundingClientRect(),home={left:hr.left+sp0,top:home0.top};
      if(g.busy())return setTimeout(()=>pull(fl,home,x,y),200);                                      // wait until you leave the hide button
      const ex=(px,py)=>[Math.max(4,Math.min(innerWidth-4,px)),Math.max(4,Math.min(innerHeight-4,py))];      // the edge point where it vanished
      g.look(...ex(x+8,y+4));g.big(true);
      const t0=performance.now()+300,D=1400,cx=(x+home.left)/2,cy=Math.min(innerHeight,Math.max(y,home.top)+40);
      const f=now=>{if(!fl.isConnected)return;
        if(g.busy()){g.release();dropSponge(fl,home,parseFloat(fl.style.left),parseFloat(fl.style.top),0,0);return}  // spell broken: it falls again
        const t=Math.max(0,Math.min(1,(now-t0)/D)),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,
          px=(1-e)*(1-e)*x+2*(1-e)*e*cx+e*e*home.left,py=(1-e)*(1-e)*y+2*(1-e)*e*cy+e*e*home.top,wob=Math.round(Math.sin(now/70)*(1-e));
        fl.style.left=px+wob+"px";fl.style.top=py+"px";fl.style.transform=`rotate(${Math.round((1-e)*6)}deg)`;g.look(...ex(px+8,py+4));
        if(t<1)requestAnimationFrame(f);else{sp.style.left=sp0+"px";fl.remove();sp.style.visibility="";g.release()}};
      requestAnimationFrame(f)}
  }
  /* the overflow: groups beyond the row, stuck on the card from the bottom up, never over the row itself */
  function stickExtra(card){card.querySelector(".scr")?.remove();const{total,dn}=marksToday(),rest=total-ROWG*4;if(rest<=0)return;
    const layer=document.createElement("div");layer.className="scr";card.prepend(layer);
    const cr=card.getBoundingClientRect(),wr=card.querySelector(".wh").getBoundingClientRect(),bottom=wr.top-cr.top-6,topY=8,n=Math.ceil(rest/4);
    for(let g=0;g<n;g++){const m=Math.min(4,rest-g*4),startIdx=ROWG*4+g*4,doneN=Math.max(0,Math.min(m,dn-startIdx));
      const px=[],P=(x,y,c)=>px.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
      groupPx(P,2,0,m,doneN,"#35275c","#41306f");                                                // barely lighter than the card
      const y=topY+Math.random()*Math.max(0,bottom-24-topY),x=4+Math.random()*(cr.width-42);
      layer.insertAdjacentHTML("beforeend",`<svg width="34" height="24" viewBox="0 0 17 12" style="position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;image-rendering:pixelated;shape-rendering:crispEdges">${px.join("")}</svg>`)}}
  const tally=()=>chalkWall();
  const WH=()=>pickOf(CAP.whisper||[""]);
  /* pixel birds flying behind the card ("я свободен") */
  const BIRD=[["X...X",".X.X.","..X.."],[".....","XX.XX","..X.."]];
  const birdSvg=f=>`<svg width="10" height="6" viewBox="0 0 5 3">${BIRD[f].map((r,y)=>[...r].map((c,x)=>c==="X"?`<rect x="${x}" y="${y}" width="1" height="1" fill="#e8d6a8"/>`:"").join("")).join("")}</svg>`;
  /* nothing done today: no birds, just one feather drifting down, swaying, and settling at the bottom */
  const FEATHER=["..X","..X",".XX",".Xo","XXo","XX.","X..","X.."];
  function feather(w,i=0){if(!w.isConnected)return;const f=document.createElement("div");f.className="bird feather";
    f.innerHTML=`<svg width="6" height="16" viewBox="0 0 3 8" style="image-rendering:pixelated;shape-rendering:crispEdges">${FEATHER.map((r,y)=>[...r].map((c,x)=>c!=="."?`<rect x="${x}" y="${y}" width="1" height="1" fill="${c==="o"?"#b9ad8e":"#e8d6a8"}"/>`:"").join("")).join("")}</svg>`;
    // carried by a draught: in from the left, a spiral over the middle of the card, out to the right
    const cr=w.querySelector(".byep").getBoundingClientRect(),cx=cr.left+cr.width/2,sc=Math.min(innerWidth,innerHeight),cy=cr.top+cr.height*.32+[0,-.04,.04][i%3]*sc,R=sc*[.17,.13,.21][i%3],D=[11000,10200,11800][i%3],t0=performance.now();
    f.style.cssText="position:fixed;left:-20px;top:"+cy+"px;z-index:3;pointer-events:none";w.appendChild(f);   // in front of the card
    // the owner's sketch: in from the left on a soft wave, into the loop at its lower left, one full turn counter-clockwise,
    // out just under the circle and away up to the right. A smooth Catmull-Rom curve through these points, travelled at an even pace.
    const pts=[[-30,cy+.9*R],[cx-2.5*R,cy+.25*R],[cx-1.3*R,cy+.75*R],[cx,cy+R],[cx+R,cy],[cx,cy-R],[cx-R,cy],[cx-.55*R,cy+1.05*R],
      [cx+.4*R,cy+1.45*R],[cx+1.6*R,cy+1.05*R],[cx+2.5*R,cy-.15*R],[cx+3.6*R,cy-.6*R],[innerWidth+60,cy-.75*R]];
    const path=[];const P=[pts[0],...pts,pts[pts.length-1]];
    for(let k=1;k<P.length-2;k++)for(let j=0;j<24;j++){const u=j/24,[p0,p1,p2,p3]=[P[k-1],P[k],P[k+1],P[k+2]],u2=u*u,u3=u2*u;
      path.push([0,1].map(d=>.5*(2*p1[d]+(-p0[d]+p2[d])*u+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*u2+(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*u3)))}
    path.push(pts[pts.length-1]);
    const acc=[0];for(let k=1;k<path.length;k++)acc.push(acc[k-1]+Math.hypot(path[k][0]-path[k-1][0],path[k][1]-path[k-1][1]));
    const L=acc[acc.length-1],at=d=>{let lo=0,hi=acc.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(acc[m]<d)lo=m;else hi=m}
      const q=(d-acc[lo])/Math.max(1e-6,acc[hi]-acc[lo]);return[path[lo][0]+(path[hi][0]-path[lo][0])*q,path[lo][1]+(path[hi][1]-path[lo][1])*q]};
    let px=-30,py=cy+.9*R,rot=0;
    const step=now=>{if(!f.isConnected)return;const t=Math.min(1,(now-t0)/D);
      const [x,y0]=at(L*t),y=y0+Math.sin(t*Math.PI*9)*2;                                         // a tiny flutter on top
      const dir=Math.atan2(y-py,x-px)*180/Math.PI+90;px=x;py=y;let d=((dir-rot+540)%360)-180;rot+=d*.12;
      f.style.left=x+"px";f.style.top=y+"px";f.style.transform="rotate("+Math.round(rot)+"deg)";
      if(t<1)requestAnimationFrame(step);else f.remove()};
    requestAnimationFrame(step)}
  function birds(w){
    // one bird per task done today (at least one, at most 15)
    const today=new Date().toDateString(),done=[...S.tasks,...(S.archive||[])].filter(t=>t.done&&t.doneAt&&new Date(t.doneAt).toDateString()===today).length;
    if(window.__forceFeather||!done){window.__forceFeather=false;for(let i=0;i<3;i++)setTimeout(()=>feather(w,i),i*900);return}  // three feathers, one after another
    const n=Math.min(15,done);
    for(let i=0;i<n;i++)setTimeout(()=>{if(!w.isConnected)return;
      const b=document.createElement("div");b.className="bird";const sc=1+Math.floor(Math.random()*2);
      b.style.cssText=`left:${-20-Math.random()*40}px;top:${30+Math.random()*55}%;transform-origin:0 0;--d:${4+Math.random()*3}s;--dx:${innerWidth+80}px;--dy:${-60-Math.random()*120}px;zoom:${sc}`;
      let f=0;b.innerHTML=birdSvg(0);const fl=setInterval(()=>{if(!b.isConnected)return clearInterval(fl);f^=1;b.innerHTML=birdSvg(f)},180+Math.random()*80);
      w.appendChild(b);setTimeout(()=>b.remove(),8000)},i*(n>8?260:420))}

  window.byeBanner=force=>{document.querySelector(".byew")?.remove();
    const today=new Date().toDateString(),open=S.tasks.filter(t=>!t.done).length,
      doneToday=[...S.tasks,...(S.archive||[])].filter(t=>t.done&&t.doneAt&&new Date(t.doneAt).toDateString()===today).length,all=doneToday+open;
    let r=roll(force);
    const w=document.createElement("div");w.className="byew";
    w.innerHTML=`<div class="byeh"><div class="byep px"><div class="art">${bigEye(S.eye||"sun",5)}</div><b>А как же ваши задачи?</b>
      <div class="fr">${doneToday}/${all}<small>сделано сегодня</small></div>
      <div class="act"><button class="btn px" data-bye="stay"></button><button class="btn px" data-bye="go"></button></div><div class="wh"></div></div><div class="note"></div>`;
    document.body.appendChild(w);
    const put=()=>{w.querySelector('[data-bye="stay"]').textContent=r.stay;w.querySelector('[data-bye="go"]').textContent=r.go;w.querySelector(".note").textContent=r.note||"";w.querySelector(".wh").innerHTML=r.fx==="tally"?tally():fmt(WH());
      if(r.fx==="tally"){setTimeout(()=>stickExtra(w.querySelector(".byep")),260);setTimeout(()=>chalkDraw(w.querySelector(".byep")),260)}else w.querySelector(".scr")?.remove();
      if(r.fx==="birds")birds(w)};
    put();
    const box=w.querySelector(".art"),pups=[...w.querySelectorAll(".bp")];
    // gaze + fear: the closer the cursor gets to the "hide" button, the narrower the pupil,
    // and it trembles inside the room it freed (full size = still, a dot = darting around its whole cell)
    let gx=0,gy=0,prox=0;
    const sk=skinOf(S.eye),PW=(sk.pw||1)*K,PH=(sk.ph||1)*K;
    // the pupil shrinks around its own centre and shakes around that centre; both grow smoothly, strongest on the button itself
    const draw=()=>{const g=typeof big!=="undefined"&&big&&!prox?1:0,w2=Math.max(1,Math.round(PW*(1-prox*.34)))+g,h2=Math.max(1,Math.round(PH*(1-prox*.34)))+g,a=prox*1.6;
      pups.forEach(p=>{const jx=a?Math.round((Math.random()*2-1)*a):0,jy=a?Math.round((Math.random()*2-1)*a):0;
        p.setAttribute("width",w2);p.setAttribute("height",h2);
        p.setAttribute("x",+p.dataset.x+gx+Math.floor((PW-w2)/2)+jx);p.setAttribute("y",+p.dataset.y+gy+Math.floor((PH-h2)/2)+jy)})};
    // the gaze glides: look() sets a target, a frame loop eases towards it (slow while watching birds, quick for the cursor)
    let tx=0,ty=0,cx=0,cy=0,ease=.35;
    const look=(nx,ny)=>{tx=Math.max(-1,Math.min(1,nx));ty=Math.max(-1,Math.min(1,ny))};
    const glide=()=>{if(!w.isConnected)return;cx+=(tx-cx)*ease;cy+=(ty-cy)*ease;
      const nx=Math.round(cx*K),ny=Math.round(cy*(K-1));if(nx!==gx||ny!==gy){gx=nx;gy=ny;draw()}requestAnimationFrame(glide)};
    requestAnimationFrame(glide);
    const tick=()=>{if(!w.isConnected)return;if(prox>0)draw();setTimeout(tick,prox>0?150-prox*100:150)};tick(); // faster as you get closer
    const near=(x,y)=>{const b=w.querySelector('[data-bye="go"]').getBoundingClientRect(),dx=Math.max(b.left-x,0,x-b.right),dy=Math.max(b.top-y,0,y-b.bottom),d=Math.hypot(dx,dy);
      const p=d<28?Math.pow(1-d/28,1.5):0;                                                     // only right next to the button; on it = 1
      if(p!==prox){prox=p;draw()}};
    const aim=(x,y)=>{const q=box.getBoundingClientRect();look((x-q.left-q.width/2)/(q.width*.7),(y-q.top-q.height/2)/(q.height*1.2))};
    // "я свободен": it watches the birds fly off, gliding from one bird to the next, and ignores the cursor.
    // Going for the hide button pulls its eye to you; move away and it goes back to the birds. When they're gone, back to the cursor.
    let birdsOn=r.fx==="birds",last=null;const t0=performance.now();
    const watching=()=>birdsOn&&prox===0;
    const follow=()=>{if(!w.isConnected||!birdsOn)return;
      const cr=w.querySelector(".byep").getBoundingClientRect(),bs=[...w.querySelectorAll(".bird")].map(b=>b.getBoundingClientRect()).filter(q=>q.right>0&&q.left<Math.min(innerWidth,cr.right+90));
      if(!bs.length&&performance.now()-t0>3500){birdsOn=false;ease=.35;if(last)aim(last[0],last[1]);return}
      if(watching()&&bs.length){const lead=bs.reduce((a,q)=>q.left>a.left?q:a);ease=.06;aim(lead.left+lead.width/2,lead.top+lead.height/2)} // the bird furthest along
      requestAnimationFrame(follow)};
    requestAnimationFrame(follow);
    // focus: something on screen the eye must look at no matter what (the fallen sponge); big = pupil 4×4 while it "pulls" it back
    let focus=null,big=false;
    const mv=e=>{last=[e.clientX,e.clientY];near(e.clientX,e.clientY);
      if(focus&&prox===0)return;
      if(!watching()){ease=.35;aim(e.clientX,e.clientY)}};
    w._gaze={look:(x,y)=>{if(prox>0)return;focus=[x,y];ease=.25;aim(x,y)},
      release:()=>{focus=null;big=false;draw();if(last)aim(last[0],last[1])},
      big:v=>{big=v;draw()},busy:()=>prox>0};
    let b0=null,g0=null;const ori=e=>{if(e.beta==null)return;if(b0==null){b0=e.beta;g0=e.gamma}look((e.gamma-g0)/15,(e.beta-b0)/15)};
    addEventListener("pointermove",mv);addEventListener("deviceorientation",ori);
    const iv=window.dock?.cursor&&setInterval(async()=>{const c=await window.dock.cursor();if(c&&!c.inside)mv({clientX:c.x,clientY:c.y})},60);
    const close=hide=>{removeEventListener("pointermove",mv);removeEventListener("deviceorientation",ori);if(iv)clearInterval(iv);
      w.classList.add("out");setTimeout(()=>w.remove(),200);if(hide)window.dock?.hide()};
    w.addEventListener("click",e=>{const b=e.target.closest("[data-bye]");
      if(b&&r.reroll){w.querySelectorAll(".act .btn").forEach(x=>{x.classList.remove("spin");void x.offsetWidth;x.classList.add("spin")});SFX.play("pick");setTimeout(()=>{r=roll();put()},220);return}
      if(b&&b.dataset.bye==="go"&&r.fx==="rickroll"&&String(r.url||"").startsWith("https://")){window.open(r.url,"_blank");close(false);return} // never gonna let you hide
      if(b)close(b.dataset.bye==="go");else if(!e.target.closest(".byep")&&performance.now()-(w._noClick||0)>400)close(false)})};

  // review helpers in the mockup
  document.getElementById("byeTools")?.remove();
  document.body.insertAdjacentHTML("beforeend",`<div id="byeTools" style="position:fixed;left:8px;bottom:64px;z-index:50;display:flex;flex-wrap:wrap;gap:2px;max-width:220px">
    ${[["","случайно"],["pair","пара"],["free","птички"],["rare","give up"]].map(([f,l])=>`<button class="btn px" style="padding:3px 7px;font-size:12px" onclick="byeBanner('${f}'||undefined)">${l}</button>`).join("")}<button class="btn px" style="padding:3px 7px;font-size:12px" onclick="{const ks=Object.keys(EYE_SKINS);S.eye=ks[(ks.indexOf(S.eye)+1)%ks.length];byeBanner();toast(skinOf(S.eye).name)}">скин ▸</button><button class="btn px" style="padding:3px 7px;font-size:12px" onclick="byeBanner('tally')">насечки</button><button class="btn px" style="padding:3px 7px;font-size:12px" onclick="byeBanner('feather')">0 птичек</button></div>`);
  document.getElementById("byeTry")?.remove();
  ready.then(()=>byeBanner("tally"));
})();
