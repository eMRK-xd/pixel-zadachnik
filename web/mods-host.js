/* ============================================================================
   Mod host. Mods are small add-ons that live as tiles in the dock (bottom right).
   Each mod runs in its own sandboxed iframe: it cannot read the board, the sync key
   or the desktop shell. It talks to the app only through messages, and only gets
   what its mod.json asks for in "permissions" (media, tasks, links).
   Sources: built-in mods in web/mods/ (listed in mods/index.json) and, on the PC,
   the user's folder %APPDATA%\com.pixel.zadachnik\mods\<id>\.  See docs/MODS.md.
   ============================================================================ */
const MODS=(()=>{
  /* ?fakemedia in the address: a pretend player, to try media mods in a browser */
  const fake=new URLSearchParams(location.search).has("fakemedia")&&(()=>{let i=0,on=true,t0=Date.now(),pos=0;
    const T=[["Night Drive","Pixel Band",214],["Gold Ring","Sun Eye",187],["A very long track name that does not fit the tile","Somebody",241]];
    const now=()=>on?pos+(Date.now()-t0)/1000:pos;
    return async(c,a)=>{if(c==="list_mods")return[];if(c==="media_art")return null;
      if(c==="media_control"){pos=now();t0=Date.now();if(a.action==="toggle")on=!on;if(a.action==="next"){i=(i+1)%T.length;pos=0}if(a.action==="prev"){i=(i+T.length-1)%T.length;pos=0}return true}
      if(c==="media_state"){const[title,artist,dur]=T[i];return{title,artist,album:"",playing:on,canNext:true,canPrev:true,pos:Math.floor(now()/5)*5,dur,app:"Spotify.exe"}}}})();
  const invoke=window.__TAURI__?.core?.invoke||fake||null;
  const HAS={media:!!invoke};                    // what this device can offer (now playing works on the PC only)
  const SOUNDS=["pick","add","drop","complete","sync","undo","del"];
  const list=[];                                 // {id,man,files,src,tile,frame,ready}
  let dock,loaded=false;

  /* ---------- the SDK every mod gets as window.zadachnik ---------- */
  function SDK(ASSETS){
    const pend=new Map(),hs={};let seq=0;
    const call=(fn,...args)=>new Promise((ok,no)=>{const id=++seq;pend.set(id,{ok,no});parent.postMessage({z:1,t:"call",id,fn,args},"*")});
    const theme=t=>{const r=document.documentElement;for(const k in t.vars)r.style.setProperty(k,t.vars[k]);r.classList.toggle("loop",!!t.loop);
      if(t.font){r.style.setProperty("--ff",t.font.family);r.classList.toggle("font-smooth",!!t.font.smooth);r.dataset.font=t.font.key}};
    // the app's font: @font-face rules arrive separately (they are big); "font" fires once the new letters can be measured
    const fontface=css=>{let st=document.getElementById("zfont");if(!st){st=document.createElement("style");st.id="zfont";document.head.appendChild(st)}
      st.textContent=css||"";const done=()=>(hs.font||[]).forEach(f=>{try{f({key:document.documentElement.dataset.font||"pix"})}catch(err){console.error(err)}});
      document.fonts?document.fonts.ready.then(()=>setTimeout(done,30)):done()};
    addEventListener("message",e=>{if(e.source!==parent)return;const m=e.data;if(!m||m.z!==1)return;
      if(m.t==="ret"){const p=pend.get(m.id);if(p){pend.delete(m.id);m.ok?p.ok(m.val):p.no(new Error(m.val))}return}
      if(m.t==="ev"){if(m.ev==="fontface")return fontface(m.data);
        if(m.ev==="theme"||m.ev==="ready")theme(m.ev==="ready"?m.data.theme:m.data);
        (hs[m.ev]||[]).forEach(f=>{try{f(m.data)}catch(err){console.error(err)}})}});
    const media=a=>()=>call("media.control",a);
    window.zadachnik=Object.freeze({
      on(ev,f){(hs[ev]=hs[ev]||[]).push(f)},
      toast:t=>call("toast",String(t)),
      sound:n=>call("sound",n),
      burst:()=>call("burst"),
      resize:h=>call("resize",+h),
      open:u=>call("open",String(u)),
      tasks:()=>call("tasks"),
      storage:Object.freeze({get:k=>call("storage.get",String(k)),set:(k,v)=>call("storage.set",String(k),v)}),
      media:Object.freeze({state:()=>call("media.state"),art:()=>call("media.art"),
        play:media("play"),pause:media("pause"),toggle:media("toggle"),next:media("next"),prev:media("prev")}),
      asset:n=>ASSETS[n]||null});
  }

  /* ---------- loading ---------- */
  const okId=id=>/^[a-z0-9][a-z0-9-]{1,30}$/.test(id||"");
  const toData=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.onerror=()=>r(null);f.readAsDataURL(b)});
  async function builtin(){
    let ids=[];try{ids=await (await fetch("mods/index.json",{cache:"no-cache"})).json()}catch{return[]}
    const out=[];
    for(const dir of ids){try{
      const get=async(f,bin)=>{const r=await fetch(`mods/${dir}/${f}`,{cache:"no-cache"});if(!r.ok)return null;return bin?toData(await r.blob()):r.text()};
      const man=JSON.parse(await get("mod.json")),files={};
      for(const f of [man.main||"main.js",man.style||"style.css",man.body||"body.html"]){const v=await get(f);if(v!=null)files[f]=v}
      for(const a of man.assets||[]){const v=await get(a,1);if(v)files[a]=v}
      out.push({man,files,src:"builtin"})}catch(e){console.warn("mod",dir,e)}}
    return out}
  async function user(){
    if(!invoke)return[];let raw=[];try{raw=await invoke("list_mods")}catch{return[]}
    return raw.map(m=>{try{return{man:JSON.parse(m.files["mod.json"]),files:m.files,src:"user"}}catch{console.warn("mod without a valid mod.json:",m.dir);return null}}).filter(Boolean)}
  async function load(){
    const all=[...await builtin(),...await user()];list.length=0;
    for(const m of all){const id=m.man.id;
      if(!okId(id)){console.warn("bad mod id",id);continue}
      if(list.some(x=>x.id===id)){console.warn("duplicate mod id",id);continue}
      m.man.permissions=(m.man.permissions||[]).filter(p=>["media","tasks","links"].includes(p));
      list.push({id,...m})}
    loaded=true;mount();if(S.setOpen)renderSettings()}

  /* ---------- on / off (per device: the PC and the phone can differ) ---------- */
  const usable=m=>m.man.permissions.every(p=>p!=="media"||HAS.media);
  const isOn=m=>usable(m)&&(LOCAL.mods?.[m.id]??(m.src==="builtin"&&m.man.default!==false));
  function toggle(id){const m=list.find(x=>x.id===id);if(!m)return;
    if(!usable(m)){toast("Этот мод работает только в приложении на ПК");return}
    LOCAL.mods={...(LOCAL.mods||{}),[id]:!isOn(m)};saveLocal();mount();renderSettings();SFX.play("pick");
    toast(`${m.man.name||id}: ${isOn(m)?"включён":"выключен"}`)}

  /* ---------- tiles ---------- */
  const esc=s=>String(s).replace(/</g,"\\u003c");
  function doc(m){const f=m.files,man=m.man,assets={};
    for(const k in f)if(/^data:/.test(f[k]))assets[k]=f[k];
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;color:var(--ink);font:14px var(--ff,ui-monospace,monospace);-webkit-font-smoothing:none;user-select:none}
html.font-smooth body{-webkit-font-smoothing:auto}
*{box-sizing:border-box}button{font:inherit;color:inherit}</style><style>${f[man.style||"style.css"]||""}</style></head>
<body>${f[man.body||"body.html"]||""}<script>${SCRUB}</script><script>(${SDK})(${esc(JSON.stringify(assets))})<\/script>
<script>${(f[man.main||"main.js"]||"").replace(/<\/script/gi,"<\\/script")}<\/script></body></html>`}
  /* the desktop shell injects its bridge into every frame; the shell refuses calls from mods (origin null, no message channel); hide what can be hidden anyway */
  const SCRUB=`for(const k of ["__TAURI__","__TAURI_INTERNALS__","__TAURI_INVOKE_KEY__","__TAURI_METADATA__","ipc","__TAURI_IPC__"])try{delete window[k];if(k in window)Object.defineProperty(window,k,{value:undefined})}catch(e){}
try{if(window.chrome){delete window.chrome.webview;if(window.chrome.webview)Object.defineProperty(window.chrome,"webview",{value:undefined})}}catch(e){}`;
  const clampW=w=>Math.max(80,Math.min(352,+w||200)),clampH=h=>Math.max(24,Math.min(160,+h||48));
  function mount(){
    dock=dock||document.getElementById("moddock");if(!dock)return;
    for(const m of list){const want=isOn(m);
      if(want&&!m.tile){const t=document.createElement("div");t.className="modtile px";t.dataset.mod=m.id;t.title=m.man.name||m.id;
        const [w,h]=m.man.size||[200,48];t.style.width=clampW(w)+"px";t.style.height=clampH(h)+"px";
        const fr=document.createElement("iframe");fr.setAttribute("sandbox","allow-scripts");fr.setAttribute("allow","");
        fr.addEventListener("load",()=>{m.ready=true;send(m,"ready",{mod:{id:m.id,name:m.man.name,version:m.man.version},theme:theme(),tasks:counts(),visible:!document.hidden});
          const fk=fontKey();loadFontCss(fk,true).then(css=>{if(fontKey()===fk)send(m,"fontface",css)});
          if(m.man.permissions.includes("media")&&MEDIA.last!==undefined){send(m,"media",MEDIA.last);if(MEDIA.art)send(m,"mediaArt",MEDIA.art)}});
        fr.srcdoc=doc(m);t.appendChild(fr);dock.appendChild(t);m.tile=t;m.frame=fr}
      if(!want&&m.tile){m.tile.remove();m.tile=m.frame=null;m.ready=false}}
    fit();MEDIA.kick()}
  /* the board keeps room at the bottom so the dock never hides the last card */
  const fit=()=>{const h=dock&&dock.children.length?dock.offsetHeight+10:0;document.getElementById("app")?.style.setProperty("--dockh",h+"px")};

  /* ---------- messages ---------- */
  const send=(m,ev,data)=>{if(m.ready&&m.frame?.contentWindow)m.frame.contentWindow.postMessage({z:1,t:"ev",ev,data},"*")};
  const emit=(ev,data,perm)=>list.forEach(m=>{if(m.tile&&(!perm||m.man.permissions.includes(perm)))send(m,ev,data)});
  const theme=()=>{const cs=getComputedStyle(document.body),vars={};
    for(const k of ["--bg","--bg2","--panel","--line","--ink","--dim","--gold","--gold-d"])vars[k]=cs.getPropertyValue(k).trim();
    const k=fontKey();return{loop:S.theme==="loop",vars,font:{key:k,name:FONTS[k].name,family:fontFamily(k),smooth:!!FONTS[k].smooth}}};
  const counts=()=>{const t=S.tasks||[];return{open:t.filter(x=>!x.done).length,done:t.filter(x=>x.done).length}};
  const lastToast={};
  const store=id=>{try{return JSON.parse(localStorage.getItem("pixel-mod:"+id)||"{}")}catch{return{}}};
  const API={
    toast(m,t){const n=Date.now();if(n-(lastToast[m.id]||0)<1500)return false;lastToast[m.id]=n;toast(String(t).slice(0,90));return true},
    sound(m,n){if(!SOUNDS.includes(n))throw"unknown sound";SFX.play(n);return true},
    burst(m){const r=m.tile.getBoundingClientRect();FX.burst(r.left+r.width/2,r.top+r.height/2,["#e0b13e","#f3d48a","#fff4cf"]);return true},
    resize(m,h){m.tile.style.height=clampH(h)+"px";fit();return true},
    open(m,u){if(!m.man.permissions.includes("links"))throw"no permission: links";if(!/^https?:\/\//i.test(u))throw"http(s) only";window.open(u,"_blank");return true},
    tasks(m){if(!m.man.permissions.includes("tasks"))throw"no permission: tasks";
      return(S.tasks||[]).map(t=>({id:t.id,text:t.text,col:t.col,done:!!t.done,due:t.due||null,subtasks:(t.subtasks||[]).map(x=>({text:x.text,done:!!x.done}))}))},
    "storage.get"(m,k){return store(m.id)[k]??null},
    "storage.set"(m,k,v){const o=store(m.id);if(v==null)delete o[k];else o[k]=v;const s=JSON.stringify(o);if(s.length>100000)throw"storage full (100 KB per mod)";
      localStorage.setItem("pixel-mod:"+m.id,s);return true},
    "media.state"(m){if(!m.man.permissions.includes("media"))throw"no permission: media";return MEDIA.last??null},
    "media.art"(m){if(!m.man.permissions.includes("media"))throw"no permission: media";return MEDIA.art},
    async "media.control"(m,a){if(!m.man.permissions.includes("media"))throw"no permission: media";if(!invoke)return false;
      const r=await invoke("media_control",{action:a});setTimeout(()=>MEDIA.poll(),250);setTimeout(()=>MEDIA.poll(),900);return r}};
  addEventListener("message",async e=>{const m=list.find(x=>x.frame&&e.source===x.frame.contentWindow);if(!m)return;
    const q=e.data;if(!q||q.z!==1||q.t!=="call")return;const reply=(ok,val)=>e.source.postMessage({z:1,t:"ret",id:q.id,ok,val},"*");
    const f=API[q.fn];if(!f)return reply(false,"unknown call: "+q.fn);
    try{reply(true,await f(m,...(q.args||[])))}catch(err){reply(false,String(err?.message||err))}});

  /* ---------- now playing: one shared poller, only while a media mod is on and the window is visible ---------- */
  const MEDIA={last:undefined,art:null,key:null,t:0,
    want:()=>HAS.media&&!document.hidden&&list.some(m=>m.tile&&m.man.permissions.includes("media")),
    kick(){clearTimeout(this.t);if(this.want())this.poll()},
    async poll(){clearTimeout(this.t);if(!this.want())return;
      let st=null;try{st=await invoke("media_state")}catch{}
      const k=st?[st.title,st.artist,st.album,st.app].join("|"):"";
      if(k!==this.key){this.key=k;this.art=null;emit("mediaArt",null,"media");
        if(st)invoke("media_art").then(a=>{if(this.key===k&&a){this.art=a;emit("mediaArt",a,"media")}}).catch(()=>{})}
      this.last=st;emit("media",st,"media");this.t=setTimeout(()=>this.poll(),1500)}};
  document.addEventListener("visibilitychange",()=>{emit("visible",!document.hidden);MEDIA.kick()});

  /* ---------- app events: called from render() ---------- */
  let prev=null,lastTheme="",lastFont=null;
  function tick(){if(!loaded)return;
    const now=new Map();for(const t of S.tasks||[]){now.set(t.id,{d:!!t.done,text:t.text,col:t.col});for(const x of t.subtasks||[])now.set(x.id,{d:!!x.done,text:x.text,col:t.col,sub:true})}
    if(prev){let n=0;for(const[id,v]of now){const p=prev.get(id);if(p&&p.d!==v.d&&n++<5)emit(v.d?"taskDone":"taskUndone",{text:v.text,col:v.col,subtask:!!v.sub})}
      emit("tasks",counts())}
    prev=now;const th=JSON.stringify(theme());if(th!==lastTheme){lastTheme=th;emit("theme",JSON.parse(th))}
    const fk=fontKey();if(fk!==lastFont){lastFont=fk;loadFontCss(fk,true).then(css=>{if(fontKey()===fk)emit("fontface",css)})}fit()}

  /* ---------- settings shelf ---------- */
  const PERM={media:"что играет и переключение треков",tasks:"видит список задач",links:"открывает ссылки"};
  function items(){
    const it=list.map(m=>({at:`data-modt="${m.id}"`,ic:m.man.icon||"◆",l:m.man.name||m.id,
      t:[m.man.description,m.man.author&&("автор: "+m.man.author),m.src==="user"&&"из папки модов",
        m.man.permissions.length&&("доступ: "+m.man.permissions.map(p=>PERM[p]).join(", "))].filter(Boolean).join("\n"),
      ...(usable(m)?{on:isOn(m)}:{v:"только ПК"})}));
    if(invoke)it.push({id:"modsDir",ic:"▣",l:"папка модов",a:1},{id:"modsReload",ic:"↻",l:"перечитать моды",a:1});
    return it}
  document.addEventListener("click",e=>{
    const t=e.target.closest("[data-modt]");if(t){toggle(t.dataset.modt);return}
    if(e.target.closest("#modsDir")){invoke("open_mods_dir").catch(err=>toast(String(err)));return}
    if(e.target.closest("#modsReload")){list.forEach(m=>{m.tile?.remove();m.tile=m.frame=null;m.ready=false});prev=null;load().then(()=>toast(`Модов: ${list.length}`));SFX.play("pick")}});

  addEventListener("resize",()=>fit());
  load();
  return{tick,items,toggle,emit,get list(){return list.map(m=>({id:m.id,name:m.man.name,on:isOn(m),src:m.src}))}};
})();
