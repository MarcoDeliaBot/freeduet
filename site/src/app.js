/* Runs inside the wrapper that tools/build.py writes into every page. The wrapper defines GH (the repository URL),
   M (the members, from members.json) and D (this page's demo strings). The page arrives complete in its own language:
   the team, the side list, the chips and the first demo state are already in the HTML. This script only adds behaviour. */
var byId={};M.forEach(function(m){byId[m[0]]=m;});
function av(id){var m=byId[id],solid=id==="iris";
 return '<svg class="av" viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="11" fill="'+m[2]+'"'+(solid?'':' fill-opacity=".13"')+'/><svg x="10" y="10" width="24" height="24" viewBox="0 0 24 24"><path d="'+m[4]+'" stroke="'+(solid?"#fff":m[2])+'" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></svg>';}

var lang=document.documentElement.lang||"en",cur=0,timers=[];
var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");}

function side(id,state){
 Array.prototype.forEach.call(document.querySelectorAll("#side .sm"),function(li){li.classList.remove("wait","ok");});
 var li=id&&state?document.querySelector('#side .sm[data-m="'+id+'"]'):null;if(li)li.classList.add(state);
}

var chat=document.getElementById("chat"),tries=document.getElementById("tries");
function bubble(id,name,text){return '<div class="msg">'+av(id)+'<div class="bub"><span class="who">'+name+'</span>'+esc(text)+'</div></div>';}
function mine(text){return '<div class="msg me"><div class="bub">'+esc(text)+'</div></div>';}
function askCard(s){var rows="";s.card.forEach(function(r){rows+="<dt>"+esc(r[0])+"</dt><dd>"+esc(r[1])+"</dd>";});
 return '<div class="card-ask" id="ask"><p class="ask-title"><svg aria-hidden="true"><use href="#i-hand"/></svg>'+esc(D.ask)+'</p><dl>'+rows+'</dl><div class="row"><button type="button" class="yes" data-a="ok">'+esc(D.yes)+'</button><button type="button" class="no" data-a="stop">'+esc(D.no)+'</button></div></div>';}
function doneRow(kind,text){return '<div class="done '+kind+'"><svg aria-hidden="true"><use href="#'+(kind==="ok"?"i-check":"i-hand")+'"/></svg><span>'+esc(text)+'</span></div>';}
function parts(s){var m=byId[s.who],p=[mine(s.me),bubble("iris","Iris",s.iris),bubble(s.who,m[1],s.line)];
 p.push(s.card?askCard(s):doneRow("stop",D.nothing));return p;}
function clearT(){timers.forEach(clearTimeout);timers=[];}
function show(i,animate){
 clearT();cur=i;var s=D.demo[i],p=parts(s);
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
tries.addEventListener("click",function(e){var b=e.target.closest("button");if(b)show(+b.getAttribute("data-s"),true);});
chat.addEventListener("click",function(e){var b=e.target.closest("button[data-a]");if(!b)return;var a=b.getAttribute("data-a"),s=D.demo[cur],c=document.getElementById("ask");
 if(c){c.outerHTML=doneRow(a==="ok"?"ok":"stop",s[a]);side(s.who,a==="ok"?"ok":"");}});

/* ---------- motion: reveal on scroll, word-by-word headings, light parallax, capsule shadow ---------- */
var root=document.documentElement;
var mqReduce=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
function reduced(){return !!(mqReduce&&mqReduce.matches);}
function qsa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
var io=null;
function watch(el){if(io)io.observe(el);else el.classList.add("in");}
function onSee(entries){
 var vis=entries.filter(function(e){return e.isIntersecting;}).sort(function(a,b){return (a.target.compareDocumentPosition(b.target)&4)?-1:1;});
 var hasHead=vis.some(function(e){return e.target.classList.contains("wd");});
 vis.forEach(function(e,i){
  var el=e.target,own=el.getAttribute("data-d");
  io.unobserve(el);
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
function unsplit(h){   /* back to plain text, so a second cut never nests words in words */
 Array.prototype.forEach.call(h.querySelectorAll("span.w"),function(sp){sp.parentNode.replaceChild(document.createTextNode(sp.textContent),sp);});
 h.normalize();
}
function words(){
 var rd=reduced();
 qsa(".wd").forEach(function(h){
  var was=h.classList.contains("in");
  unsplit(h);
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
if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener("change",function(){words();tick();});
else if(mqReduce&&mqReduce.addListener)mqReduce.addListener(function(){words();tick();});
root.setAttribute("data-rv","ready");
frame();
words();

/* ---------- language links: one real page per language ----------
   The list is plain links, so choosing a language is a navigation and every language page can be found without
   JavaScript. This code only tidies the menu and remembers the choice (fd-lang) as a hint for the next visit.
   It never redirects: not by navigator.language and not by the stored value, so a visitor or a crawler always
   gets the page it asked for. If the stored language is not this page's, the control gets a small dot and the
   stored language is marked in the list, and that is all. */
(function(){
 var box=document.getElementById("langs");if(!box)return;
 var det=box.querySelector("details"),links=box.querySelectorAll("a[hreflang]");
 if(!det||!links.length)return;
 function close(back){if(!det.open)return;det.open=false;if(back){var s=det.querySelector("summary");if(s)s.focus();}}
 box.addEventListener("click",function(e){
  var a=e.target.closest?e.target.closest("a[hreflang]"):null;if(!a)return;
  try{localStorage.setItem("fd-lang",a.getAttribute("hreflang"));}catch(x){}
  if(location.hash)a.setAttribute("href",a.pathname+location.hash);   /* stay on the same section */
 });
 document.addEventListener("pointerdown",function(e){if(det.open&&!box.contains(e.target))close(false);});
 box.addEventListener("keydown",function(e){if(e.key==="Escape"&&det.open){e.preventDefault();close(true);}});
 box.addEventListener("focusout",function(e){var n=e.relatedTarget;if(det.open&&n&&!box.contains(n))close(false);});
 var saved="";
 try{saved=localStorage.getItem("fd-lang")||"";}catch(x){saved="";}
 if(saved&&saved!==lang)Array.prototype.forEach.call(links,function(a){
  if(a.getAttribute("hreflang")===saved){a.setAttribute("data-pref","");box.setAttribute("data-hint","");}
 });
})();

var cp=document.getElementById("copy");
cp.addEventListener("click",function(){
 var txt=["git clone "+GH+".git","cd freeduet","cp .env.example .env","bash scripts/start.sh","cd openbot && docker compose exec -it agent-freeduet claude"].join("\n");
 var okk=function(){cp.textContent=D.copied;setTimeout(function(){cp.textContent=D.copy;},1800);};
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

/* =====================================================================================================================
   PREVIEW BLOCKS. Each IIFE below belongs to one block of body.html and can be deleted with it.
   ===================================================================================================================== */

/* ---------- BLOCK hero: the demo plays by itself (ask, hand-off, card, Approve) until the person touches it ---------- */
(function(){
 var btn=document.getElementById("loop"),fig=document.querySelector(".appfig"),win=fig&&fig.querySelector(".appwin");
 if(!btn||!win||reduced())return;          /* reduced motion: the demo stays still, as before, and the control stays hidden */
 btn.hidden=false;
 var playing=true,vis=false,auto=false,timer=null,gen=0;
 function paint(){
  btn.setAttribute("aria-pressed",playing?"false":"true");
  win.classList.toggle("live",playing&&vis);
  chat.setAttribute("aria-live",playing?"off":"polite");   /* a screen reader is not read a chat that changes by itself */
 }
 function wait(ms,fn){var g=gen;clearTimeout(timer);timer=setTimeout(function(){if(g===gen&&playing&&vis&&!document.hidden)fn();},ms);}
 function approve(){
  var b=document.querySelector('#ask .yes');
  if(!b){wait(3400,nextDemo);return;}
  b.classList.add("pressed");
  wait(450,function(){auto=true;b.click();auto=false;wait(3400,nextDemo);});
 }
 function nextDemo(){auto=true;show((cur+1)%D.demo.length,true);auto=false;paint();wait(4200,approve);}
 function start(){gen++;paint();wait(2600,approve);}
 function stop(){if(!playing)return;playing=false;gen++;clearTimeout(timer);paint();}
 btn.addEventListener("click",function(){if(playing){stop();}else{playing=true;start();}});
 /* any real action in the window ends the autoplay for good (until Play is pressed) */
 win.addEventListener("pointerdown",function(e){if(!auto&&!btn.contains(e.target))stop();},true);
 win.addEventListener("keydown",function(e){if(!auto&&!btn.contains(e.target))stop();},true);
 if("IntersectionObserver" in window){
  new IntersectionObserver(function(es){var v=es[0].isIntersecting;if(v===vis)return;vis=v;paint();if(vis&&playing)start();else{gen++;clearTimeout(timer);}},{threshold:.4}).observe(win);
 }else{vis=true;start();}
 document.addEventListener("visibilitychange",function(){if(!document.hidden&&playing&&vis)start();});
 paint();
})();

/* ---------- BLOCK team: each card plays its small scene once when it is half visible, and again on hover or focus ---------- */
(function(){
 var cards=qsa(".mem");if(!cards.length)return;
 function play(c){if(reduced())return;c.classList.remove("go");void c.offsetWidth;c.classList.add("go");}
 if("IntersectionObserver" in window){
  var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){o.unobserve(e.target);play(e.target);}});},{threshold:.55});
  cards.forEach(function(c){o.observe(c);});
 }
 cards.forEach(function(c){
  var at=0;
  function again(){var n=Date.now();if(n-at<2600)return;at=n;play(c);}
  c.addEventListener("pointerenter",again);c.addEventListener("focusin",again);
 });
})();

/* ---------- BLOCK jobs: a real tab list (arrow keys, Home, End); the panels are already in the page ---------- */
(function(){
 var box=document.getElementById("jobsBox");if(!box)return;
 var tabs=qsa("#jobsBox [role=tab]"),panels=qsa("#jobsBox [role=tabpanel]");
 function pick(i,focus){
  tabs.forEach(function(t,k){var on=k===i;t.setAttribute("aria-selected",on?"true":"false");t.tabIndex=on?0:-1;});
  panels.forEach(function(p,k){p.classList.remove("on");if(k===i){void p.offsetWidth;if(!reduced()&&focus!==null)p.classList.add("on");else p.classList.add("on","still");}});
  if(focus)tabs[i].focus();
 }
 panels.forEach(function(p,k){p.classList.toggle("on",k===0);});
 box.addEventListener("click",function(e){var t=e.target.closest("[role=tab]");if(t)pick(tabs.indexOf(t),false);});
 box.addEventListener("keydown",function(e){
  var t=e.target.closest("[role=tab]");if(!t)return;
  var i=tabs.indexOf(t),n=tabs.length,j=-1;
  if(e.key==="ArrowRight"||e.key==="ArrowDown")j=(i+1)%n;
  else if(e.key==="ArrowLeft"||e.key==="ArrowUp")j=(i+n-1)%n;
  else if(e.key==="Home")j=0;else if(e.key==="End")j=n-1;
  if(j<0)return;e.preventDefault();pick(j,true);
 });
})();

/* ---------- BLOCK languages: the big greeting changes language while the section is in view ---------- */
(function(){
 var el=document.getElementById("hello"),box=document.getElementById("lgPills");
 if(!el||!box||!D.hello)return;
 var list=D.hello,pills=qsa("#lgPills a"),i=0,timer=null,vis=false;
 for(var k=0;k<list.length;k++)if(list[k][0]===lang)i=k;
 function set(k){
  el.textContent=list[k][1];el.setAttribute("lang",list[k][0]);
  pills.forEach(function(a){a.classList.toggle("hot",a.getAttribute("hreflang")===list[k][0]);});
 }
 el.setAttribute("lang",lang);
 if(reduced()||!("IntersectionObserver" in window))return;   /* still: this page's own greeting and the twelve links */
 function step(){
  el.classList.add("swap");
  setTimeout(function(){i=(i+1)%list.length;set(i);el.classList.remove("swap");},350);
 }
 function run(){clearInterval(timer);timer=null;if(vis&&!document.hidden)timer=setInterval(step,1900);}
 new IntersectionObserver(function(es){vis=es[0].isIntersecting;run();},{threshold:.3}).observe(el);
 document.addEventListener("visibilitychange",run);
})();
