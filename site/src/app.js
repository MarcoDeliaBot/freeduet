/* Runs inside the wrapper that tools/build.py writes into every page. The wrapper defines GH (the repository URL) and
   D (the strings of the copy button). Every text and picture is already in the HTML in its own language: this script
   only adds behaviour (the hero replay, the step story, the buttons of the feature panes, reveal, links). */
var lang=document.documentElement.lang||"en";

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

/* ---------- the hero: a replay of two requests. It changes classes and reads text that the page already holds ---------- */
(function(){
 var win=document.getElementById("appwin"),big=document.getElementById("bigiris"),ptr=document.getElementById("ptr");
 var chat=document.getElementById("chat"),typed=document.getElementById("typed"),ph=document.getElementById("ph");
 var pause=document.getElementById("pause"),lblP=document.getElementById("lbl-pause"),lblPl=document.getElementById("lbl-play");
 if(!win||!big||!ptr||!chat)return;
 var rd=reduced(),timers=[],aimT=null,running=false,userStopped=false;
 function $(id){return document.getElementById(id);}
 function later(ms,fn){timers.push(setTimeout(fn,ms));}
 function setState(s){big.setAttribute("data-s",s);}
 function roster(id,cls){var li=$("r-"+id);if(!li)return;li.classList.remove("is-on","is-wait");if(cls)li.classList.add(cls);}
 function rosterReset(){["otto","portia","penny","jules","wren","vera"].forEach(function(id){roster(id,"");});roster("iris","is-on");}
 function aim(){
  var b=big.getBoundingClientRect(),p=ptr.getBoundingClientRect(),svg=big.querySelector("svg");
  if(!b.width||!p.width||!svg)return;
  var dx=(p.left+p.width/2-(b.left+b.width/2))/b.width,dy=(p.top+p.height/2-(b.top+b.height/2))/b.height;
  svg.style.setProperty("--px",Math.max(-3.4,Math.min(3.4,dx*12)).toFixed(2)+"px");
  svg.style.setProperty("--py",Math.max(-3.4,Math.min(3.4,dy*12)).toFixed(2)+"px");
 }
 function moveTo(el){
  var w=win.getBoundingClientRect(),e=el.getBoundingClientRect();
  ptr.style.transform="translate("+(e.left-w.left+e.width*0.4).toFixed(1)+"px,"+(e.top-w.top+e.height*0.5).toFixed(1)+"px)";
 }
 function ids(n){return n?{u:"u-b",i:"i-b",h:"h-b",c:"c-b"}:{u:"u-a",i:"i-a",h:"h-a",c:"c-a"};}
 function bubbleText(msg){var b=msg&&msg.querySelector(".bub");return b?b.textContent:"";}
 function txtOf(msg){var t=msg&&msg.querySelector(".txt");return t?t.textContent:"";}
 function setShown(el,on){if(el)el.hidden=!on;}
 function resetStory(n){
  var o=ids(n),c=$(o.c),tw=c&&c.querySelector(".t-w"),tok=c&&c.querySelector(".t-ok"),tno=c&&c.querySelector(".t-no");
  setShown($(o.u),false);setShown($(o.i),false);setShown($(o.h),false);setShown(c,false);
  if(c)c.classList.remove("is-ok");
  if(tw)tw.hidden=false;if(tok)tok.hidden=true;if(tno)tno.hidden=true;
  Array.prototype.forEach.call(document.querySelectorAll("#i-"+(n?"a":"b")+",#h-"+(n?"a":"b")+",#u-"+(n?"a":"b")),function(el){el.hidden=true;});
  rosterReset();setState("idle");
  if(typed)typed.textContent="";
  if(ph)ph.hidden=false;
 }
 function playStory(n){
  var o=ids(n),u=$(o.u),i=$(o.i),h=$(o.h),c=$(o.c),yes=c&&c.querySelector(".sim.yes"),tw=c&&c.querySelector(".t-w"),tok=c&&c.querySelector(".t-ok");
  var req=bubbleText(u),t=0,s=0;
  if(!req)return;
  resetStory(n);
  if(ph)ph.hidden=true;
  setState("listen");
  (function type(){
   s++;
   if(typed)typed.textContent=req.slice(0,s);
   if(s<req.length){later(38,type);return;}
   later(380,function(){
    if(typed)typed.textContent="";if(ph)ph.hidden=false;
    setShown(u,true);setState("think");
    later(420,function(){
     setShown(i,true);i.querySelector(".bub").classList.add("is-typing");
     later(900,function(){i.querySelector(".bub").classList.remove("is-typing");});
     later(1500,function(){
      roster("otto","is-on");setState("work");
      setShown(h,true);h.querySelector(".bub").classList.add("is-typing");
      later(900,function(){h.querySelector(".bub").classList.remove("is-typing");});
      later(1400,function(){
       setShown(c,true);roster("otto","is-wait");setState("ask");
       later(900,function(){if(yes)moveTo(yes);});
       later(1900,function(){ptr.classList.add("press");later(180,function(){ptr.classList.remove("press");});});
       later(2100,function(){
        if(c)c.classList.add("is-ok");if(tw)tw.hidden=true;if(tok)tok.hidden=false;
        roster("otto","is-on");setState("done");
       });
       later(4600,function(){
        if(chat)chat.classList.add("is-fading");
        later(700,function(){
         if(chat)chat.classList.remove("is-fading");
         if(n===0)playStory(1);else playStory(0);
        });
       });
      });
     });
    });
   });
  })();
 }
 function start(){
  if(rd||running)return;
  running=true;userStopped=false;
  win.classList.remove("is-paused");
  if(lblP)lblP.hidden=false;if(lblPl)lblPl.hidden=true;
  if(!aimT)aimT=setInterval(aim,90);
  playStory(0);
 }
 function halt(){
  timers.forEach(clearTimeout);timers=[];
  if(aimT){clearInterval(aimT);aimT=null;}
  running=false;win.classList.add("is-paused");
  if(lblP)lblP.hidden=true;if(lblPl)lblPl.hidden=false;
 }
 if(rd){
  /* reduced motion: the page shows the finished first request and no replay */
  var a=$("c-a");
  if(a){setShown($("u-a"),true);setShown($("i-a"),true);setShown($("h-a"),true);setShown(a,true);a.classList.add("is-ok");
   var tw=a.querySelector(".t-w"),tok=a.querySelector(".t-ok");if(tw)tw.hidden=true;if(tok)tok.hidden=false;}
  setShown($("u-b"),false);setShown($("i-b"),false);setShown($("h-b"),false);setShown($("c-b"),false);
  setState("done");
  return;
 }
 if(pause){
  pause.hidden=false;
  pause.addEventListener("click",function(){userStopped=running;if(running)halt();else start();});
 }
 if("IntersectionObserver" in window){
  new IntersectionObserver(function(es){
   es.forEach(function(e){
    if(e.isIntersecting){if(!running&&!userStopped)start();}
    else if(running)halt();
   });
  },{threshold:.2}).observe(win);
 }
})();

/* ---------- the story: five steps that play by themselves, like a GIF ----------
   One scene moves from step to step on a timer and loops. It runs only while the scene is on screen, the tab is visible
   and the reader has not paused it. With reduced motion there is no timer: the five steps stay on the page as a static
   stack, which the HTML already holds. */
(function(){
 var how=document.getElementById("how");
 if(!how)return;
 var scene=how.querySelector(".stage-wrap"),stage=how.querySelector(".stage-svg"),btn=document.getElementById("story-pause");
 var steps=how.querySelectorAll(".steps li"),dots=how.querySelectorAll(".story-dots span");
 if(!scene||!stage||!btn||!steps.length)return;
 /* The timeline, in ms. Caption k is up from SWITCH[k] on. The scene moves from step k-1 to step k over HALF ms either
    side of SWITCH[k], so the caption changes when the scene is halfway between the two. The last caption stays up longer. */
 var SWITCH=[0,3000,6000,9000,12000],END=16000,HALF=450;
 var t=0,cur=-1,lastS="",run=false,raf=0,last=0,onScreen=false,hidden=document.visibilityState==="hidden",paused=false;
 function ease(u){return u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;}
 function pose(x){
  var c=0,s=0,i;
  for(i=1;i<SWITCH.length;i++){if(x>=SWITCH[i])c=i;}
  s=c;
  for(i=1;i<SWITCH.length;i++){
   var a=SWITCH[i]-HALF;
   if(x>=a&&x<SWITCH[i]+HALF){s=(i-1)+ease((x-a)/(2*HALF));break;}
  }
  return {c:c,s:s};
 }
 function render(p){
  var sv=p.s.toFixed(3);
  if(sv!==lastS){stage.style.setProperty("--s",sv);lastS=sv;}
  if(p.c!==cur){
   cur=p.c;
   Array.prototype.forEach.call(steps,function(li,k){li.classList.toggle("on",k===cur);});
   Array.prototype.forEach.call(dots,function(d,k){d.classList.toggle("on",k===cur);});
  }
 }
 function frame(now){
  raf=0;
  var dt=Math.min(now-last,100);   /* a slow frame or a tab that was away moves the story by 100 ms at most */
  last=now;
  t=(t+dt)%END;
  render(pose(t));
  raf=requestAnimationFrame(frame);
 }
 function sync(){
  var go=!reduced()&&!paused&&onScreen&&!hidden;
  if(go===run)return;
  run=go;
  if(go){last=performance.now();raf=requestAnimationFrame(frame);}
  else if(raf){cancelAnimationFrame(raf);raf=0;}
 }
 function mode(){
  var on=!reduced();
  how.classList.toggle("is-live",on);
  btn.hidden=!on;
  if(on)render(pose(t));
  sync();
 }
 btn.addEventListener("click",function(){
  paused=!paused;
  btn.setAttribute("aria-pressed",paused?"true":"false");
  sync();
 });
 if("IntersectionObserver" in window){
  new IntersectionObserver(function(es){
   es.forEach(function(e){onScreen=e.isIntersecting;});
   sync();
  },{threshold:.2}).observe(scene);
 }else onScreen=true;
 document.addEventListener("visibilitychange",function(){hidden=document.visibilityState==="hidden";sync();});
 if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener("change",mode);
 else if(mqReduce&&mqReduce.addListener)mqReduce.addListener(mode);
 mode();
})();

/* ---------- the feature panes: the approval card, the routine's pause ---------- */
(function(){
 var mail=document.getElementById("mail");
 if(mail){
  var yes=mail.querySelector('button[data-a="ok"]'),no=mail.querySelector('button[data-a="stop"]'),reset=document.getElementById("mail-reset");
  var wait=mail.querySelector(".st-w"),okS=mail.querySelector(".st-ok"),noS=mail.querySelector(".st-no"),send=document.getElementById("act-send");
  function decide(ok){
   mail.classList.toggle("is-ok",ok);mail.classList.toggle("is-no",!ok);
   wait.hidden=true;okS.hidden=!ok;noS.hidden=ok;
   yes.hidden=true;no.hidden=true;reset.hidden=false;
   if(send)send.classList.toggle("done",ok);
   reset.focus();
  }
  function restart(){
   mail.classList.remove("is-ok","is-no");
   wait.hidden=false;okS.hidden=true;noS.hidden=true;
   yes.hidden=false;no.hidden=false;reset.hidden=true;
   if(send)send.classList.remove("done");
  }
  mail.addEventListener("click",function(e){
   var b=e.target.closest?e.target.closest("button"):null;if(!b)return;
   if(b===yes)decide(true);else if(b===no)decide(false);else if(b===reset){restart();yes.focus();}
  });
 }
 var rt=document.getElementById("routine"),rtb=document.getElementById("rt-btn");
 if(rt&&rtb){
  var pl=document.getElementById("rt-pause-l"),rl=document.getElementById("rt-resume-l"),run=document.getElementById("rt-run"),off=document.getElementById("rt-off");
  rtb.addEventListener("click",function(){
   var paused=!rt.classList.contains("is-paused");
   rt.classList.toggle("is-paused",paused);
   pl.hidden=paused;rl.hidden=!paused;run.hidden=paused;off.hidden=!paused;
  });
 }
})();
