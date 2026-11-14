var M=[
 ["iris","Iris","#1B4FD8","f1","M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"],
 ["otto","Otto","#E8590C","f1","M3 6h18v12H3zM3 7l9 7 9-7"],
 ["portia","Portia","#0E7C86","f2","M12 4v16M7 20h10M5 8h14M5 8l-2.5 6h5zM19 8l-2.5 6h5z"],
 ["penny","Penny","#A87900","f3","M7 4h10v16l-2.5-2-2.5 2-2.5-2L7 20zM10 9h4M10 13h4"],
 ["jules","Jules","#C2255C","f1","M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4"],
 ["wren","Wren","#2B8A3E","f3","M4 20h16M6 16L16 5l3 3L9 19l-4 1z"],
 ["mark","Mark","#C92A2A","f1","M4 10v4h3l7 4V6l-7 4H4zM17.5 9.5a4 4 0 010 5"],
 ["gus","Gus","#B5540B","f1","M14.5 5.5a4 4 0 004 4l-9 9-3-3 9-9z"],
 ["basil","Basil","#5C940D","f3","M5 19C5 9 11 5 19 5c0 8-4 14-14 14zM5 19l8-8"],
 ["vera","Vera","#5C6B80","f2","M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L20 20"],
 ["leo","Leo","#C46A00","f1","M12 4v16M4 12h16"]
];
var byId={};M.forEach(function(m){byId[m[0]]=m;});
function av(id){var m=byId[id],solid=id==="iris";
 return '<svg class="av" viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="11" fill="'+m[2]+'"'+(solid?'':' fill-opacity=".13"')+'/><svg x="10" y="10" width="24" height="24" viewBox="0 0 24 24"><path d="'+m[4]+'" stroke="'+(solid?"#fff":m[2])+'" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></svg>';}

var lang="en",EN={},cur=0,timers=[];
var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function L(){return T[lang];}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");}

var memSeen={};
function drawTeam(){
 var g=document.getElementById("teamGrid"),t=L().team,h="";
 M.forEach(function(m,i){var d=t[m[0]];
  h+='<article class="mem'+(i===0?" boss":"")+(memSeen[i]?"":" rv")+'" data-k="'+i+'" style="--mc:'+m[2]+'">'+av(m[0])+'<h3>'+m[1]+'<span>'+esc(d[0])+'</span></h3><p>'+esc(d[1])+'</p><q>'+esc(d[2])+'</q></article>';});
 Array.prototype.forEach.call(g.children,function(c){unwatch(c);});
 g.innerHTML=h;
 Array.prototype.forEach.call(g.querySelectorAll(".rv"),function(c){watch(c);});
}

function hydrateAv(){Array.prototype.forEach.call(document.querySelectorAll("[data-av]"),function(el){el.innerHTML=av(el.getAttribute("data-av"));});}
hydrateAv();
function drawSide(){
 var t=L(),h="";
 M.forEach(function(m){var d=t.team[m[0]],lm=t.lm&&t.lm[m[0]]||"";
  h+='<li class="sm'+(m[0]==="iris"?" on":"")+'" data-m="'+m[0]+'"><span class="avw">'+av(m[0])+'<i class="sdot"></i></span><div><b>'+m[1]+'<span>'+esc(d[0])+'</span></b><small>'+esc(lm)+'</small></div></li>';});
 document.getElementById("side").innerHTML=h;
 document.getElementById("awHead").innerHTML=av("iris")+'<div><b>Iris</b><small>'+esc(t.team.iris[0])+'</small></div>';
}
function side(id,state){
 Array.prototype.forEach.call(document.querySelectorAll("#side .sm"),function(li){li.classList.remove("wait","ok");});
 var li=id&&state?document.querySelector('#side .sm[data-m="'+id+'"]'):null;if(li)li.classList.add(state);
}
function drawWeek(){
 var days=document.querySelectorAll("#wk .d"),f;
 try{f=new Intl.DateTimeFormat(lang,{weekday:"narrow"});}catch(x){f=null;}
 if(!f)return;
 Array.prototype.forEach.call(days,function(el,i){el.textContent=f.format(new Date(2024,0,1+i));});
}

var chat=document.getElementById("chat"),tries=document.getElementById("tries");
function bubble(id,name,text){return '<div class="msg">'+av(id)+'<div class="bub"><span class="who">'+name+'</span>'+esc(text)+'</div></div>';}
function mine(text){return '<div class="msg me"><div class="bub">'+esc(text)+'</div></div>';}
function askCard(s){var t=L(),rows="";s.card.forEach(function(r){rows+="<dt>"+esc(r[0])+"</dt><dd>"+esc(r[1])+"</dd>";});
 return '<div class="card-ask" id="ask"><p class="ask-title"><svg aria-hidden="true"><use href="#i-hand"/></svg>'+esc(t.ask)+'</p><dl>'+rows+'</dl><div class="row"><button type="button" class="yes" data-a="ok">'+esc(t.yes)+'</button><button type="button" class="no" data-a="stop">'+esc(t.no)+'</button></div></div>';}
function doneRow(kind,text){return '<div class="done '+kind+'"><svg aria-hidden="true"><use href="#'+(kind==="ok"?"i-check":"i-hand")+'"/></svg><span>'+esc(text)+'</span></div>';}
function parts(s){var m=byId[s.who],p=[mine(s.me),bubble("iris","Iris",s.iris),bubble(s.who,m[1],s.line)];
 p.push(s.card?askCard(s):doneRow("stop",L().nothing));return p;}
function clearT(){timers.forEach(clearTimeout);timers=[];}
function show(i,animate){
 clearT();cur=i;var s=L().demo[i],p=parts(s);
 side(s.who,s.card?"wait":"");
 Array.prototype.forEach.call(tries.children,function(b,k){b.setAttribute("aria-pressed",k===i?"true":"false");});
 if(!animate||reduce){chat.innerHTML=p.join("");return;}
 chat.innerHTML=p[0];var step=1;
 (function next(){
  if(step>=p.length)return;
  var isBub=step<3;
  if(isBub){var who=step===1?"iris":s.who;chat.insertAdjacentHTML("beforeend",'<div class="msg" id="typ">'+av(who)+'<div class="bub"><span class="typing"><i></i><i></i><i></i></span></div></div>');}
  timers.push(setTimeout(function(){var t=document.getElementById("typ");if(t)t.remove();chat.insertAdjacentHTML("beforeend",p[step]);step++;timers.push(setTimeout(next,350));},isBub?900:300));
 })();
}
function drawTries(){var h="";L().demo.forEach(function(s,i){h+='<button type="button" data-s="'+i+'" aria-pressed="'+(i===cur)+'">'+esc(s.chip)+'</button>';});tries.innerHTML=h;}
tries.addEventListener("click",function(e){var b=e.target.closest("button");if(b)show(+b.getAttribute("data-s"),true);});
chat.addEventListener("click",function(e){var b=e.target.closest("button[data-a]");if(!b)return;var a=b.getAttribute("data-a"),s=L().demo[cur],c=document.getElementById("ask");
 if(c){c.outerHTML=doneRow(a==="ok"?"ok":"stop",s[a]);side(s.who,a==="ok"?"ok":"");}});

/* ---------- motion: reveal on scroll, word-by-word headings, light parallax, capsule shadow ---------- */
var root=document.documentElement;
var mqReduce=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
function reduced(){return !!(mqReduce&&mqReduce.matches);}
function qsa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
var io=null;
function watch(el){if(io)io.observe(el);else el.classList.add("in");}
function unwatch(el){if(io)io.unobserve(el);}
function onSee(entries){
 var vis=entries.filter(function(e){return e.isIntersecting;}).sort(function(a,b){return (a.target.compareDocumentPosition(b.target)&4)?-1:1;});
 var hasHead=vis.some(function(e){return e.target.classList.contains("wd");});
 vis.forEach(function(e,i){
  var el=e.target,own=el.getAttribute("data-d"),k=el.getAttribute("data-k");
  io.unobserve(el);
  if(k!==null)memSeen[k]=1;
  if(el.classList.contains("wd")){el.style.setProperty("--bd",(own!==null?+own:0)+"ms");}
  else{el.style.setProperty("--d",(own!==null?+own:(hasHead?160:0)+Math.min(i,6)*90)+"ms");}
  el.classList.add("in");
 });
}
if("IntersectionObserver" in window){io=new IntersectionObserver(onSee,{threshold:.15,rootMargin:"0px 0px -4% 0px"});}
qsa(".rv,.wd").forEach(watch);

/* Headings are cut into words. Intl.Segmenter finds the words of Chinese and Japanese, which have no spaces.
   Without it those two languages reveal the whole heading at once; the others split on spaces. */
var seg=null,segLang="";
function segmenter(){
 if(typeof Intl==="undefined"||!Intl.Segmenter)return null;
 if(segLang!==lang){try{seg=new Intl.Segmenter(lang,{granularity:"word"});}catch(x){seg=null;}segLang=lang;}
 return seg;
}
function pieces(text){
 var S=segmenter(),out=[];
 if(S){
  var cur=null,buf="";
  Array.from(S.segment(text)).forEach(function(g){
   var t=g.segment;
   if(/^\s+$/.test(t)){cur=null;if(buf){out.push({w:buf});buf="";}out.push({s:t});return;}
   if(g.isWordLike){cur={w:buf+t};buf="";out.push(cur);return;}
   if(cur)cur.w+=t;else buf+=t;
  });
  if(buf)out.push({w:buf});
  return out;
 }
 if(lang==="ja"||lang==="zh")return [{w:text}];
 text.split(/(\s+)/).forEach(function(p){if(p)out.push(/^\s+$/.test(p)?{s:p}:{w:p});});
 return out;
}
function splitHeading(h){
 var n=0,w=document.createTreeWalker(h,NodeFilter.SHOW_TEXT,null),nodes=[],t;
 while((t=w.nextNode()))nodes.push(t);
 nodes.forEach(function(tn){
  if(!tn.nodeValue.trim())return;
  var f=document.createDocumentFragment();
  pieces(tn.nodeValue).forEach(function(p){
   if(p.s){f.appendChild(document.createTextNode(p.s));return;}
   var sp=document.createElement("span");sp.className="w";sp.style.setProperty("--w",n++);sp.textContent=p.w;f.appendChild(sp);
  });
  tn.parentNode.replaceChild(f,tn);
 });
}
function words(){
 var rd=reduced();
 qsa(".wd").forEach(function(h){
  var was=h.classList.contains("in");
  if(rd){h.classList.add("rv","wsp");return;}
  h.classList.remove("rv");
  splitHeading(h);h.classList.add("wsp");
  if(was){h.classList.remove("in");void h.offsetWidth;h.classList.add("in");}   /* the new words play again */
 });
}

var layers=qsa("[data-par]"),bar=document.querySelector(".top"),ticking=false,moved=false;
function frame(){
 ticking=false;
 var y=window.pageYOffset||0,vh=window.innerHeight||1;
 if(bar)bar.classList.toggle("scrolled",y>8);
 if(reduced()){if(moved){layers.forEach(function(l){l.style.transform="";});moved=false;}return;}
 var todo=[];   /* read every position first, then write, so the frame forces no extra layout */
 layers.forEach(function(el){
  var v=el.getAttribute("data-par").split(":"),k=parseFloat(v[1])||0,host=el.closest("section,footer");
  if(!host)return;
  var r=host.getBoundingClientRect();
  if(r.bottom<-300||r.top>vh+300)return;
  todo.push([el,v[0]==="lag"?Math.min(Math.max(0,-r.top)*k,160):Math.min(Math.max(0,r.bottom-vh)*k,90)]);
 });
 todo.forEach(function(t){t[0].style.transform="translate3d(0,"+t[1].toFixed(1)+"px,0)";moved=true;});
}
function tick(){if(!ticking){ticking=true;requestAnimationFrame(frame);}}
window.addEventListener("scroll",tick,{passive:true});
window.addEventListener("resize",tick,{passive:true});
if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener("change",function(){apply(lang);tick();});
else if(mqReduce&&mqReduce.addListener)mqReduce.addListener(function(){apply(lang);tick();});
root.setAttribute("data-rv","ready");
frame();

function apply(l){
 lang=T[l]?l:"en";var t=L();
 document.documentElement.lang=lang;document.title=t.title;
 var d=document.querySelector('meta[name="description"]');if(d)d.setAttribute("content",t.desc);
 Array.prototype.forEach.call(document.querySelectorAll("[data-i]"),function(el){var k=el.getAttribute("data-i");
  var v=t[k];if(v!=null)el.innerHTML=v;});
 sel.value=lang;
 drawTeam();drawSide();drawWeek();drawTries();show(cur,false);
 words();
}
var sel=document.getElementById("lang");
LANGS.forEach(function(l){var o=document.createElement("option");o.value=l[0];o.textContent=l[1];sel.appendChild(o);});
sel.addEventListener("change",function(){apply(sel.value);try{localStorage.setItem("fd-lang",lang);}catch(x){}});
var start="";
try{start=localStorage.getItem("fd-lang")||"";}catch(x){start="";}
if(!start){var n=(navigator.language||"en").slice(0,2).toLowerCase();start=T[n]?n:"en";}
apply(start);

var cp=document.getElementById("copy");
cp.addEventListener("click",function(){
 var txt=["git clone "+GH+".git","cd freeduet","cp .env.example .env","bash scripts/start.sh","cd openbot && docker compose exec -it agent-freeduet claude"].join("\n");
 var okk=function(){cp.textContent=L().copied;setTimeout(function(){cp.textContent=L().copy;},1800);};
 try{navigator.clipboard.writeText(txt).then(okk,function(){});}catch(x){}
});

(function(){
 var box=document.getElementById("stars"),num=document.getElementById("starsN");
 if(!box||!num)return;
 function put(n){
  if(typeof n!=="number"||!isFinite(n)||n<0)return;
  num.textContent=n>=1000?(n/1000).toFixed(n>=10000?0:1).replace(/\.0$/,"")+"k":String(n);
  box.hidden=false;
 }
 var c=null;
 try{c=JSON.parse(sessionStorage.getItem("fd-stars")||"null");}catch(x){c=null;}
 if(c&&typeof c.n==="number"&&typeof c.t==="number"&&Date.now()-c.t<600000){put(c.n);return;}
 try{
  fetch(GH.replace("https://github.com/","https://api.github.com/repos/")).then(function(r){return r.ok?r.json():null;}).then(function(j){
   var n=j&&j.stargazers_count;
   if(typeof n!=="number")return;
   put(n);
   try{sessionStorage.setItem("fd-stars",JSON.stringify({n:n,t:Date.now()}));}catch(x){}
  }).catch(function(){});
 }catch(x){}
})();
