// Checks the languages of the site, then runs checkpages.py on the built pages. Run it from anywhere:
//   node site/tools/checklang.js
// 1. the language files are exactly the languages listed in src/site.json (the one list the build and
//    checkpages.py also read), and each has the same keys and the same tags as the default language (English)
// 2. the weekday letters in src/site.json are what Intl gives for each language (the build writes them into the HTML)
// 3. the new design's dictionaries, site/app/src/i18n/<code>.json: the same keys as en.json, the same {placeholders} and the
//    same inline marks (**strong**, *emphasis*, ==accent==) in every value, no HTML tag in a value, and "_untranslated"
//    only as true. A file without the marker is the language's page in the new design, so it must really be translated
//    (many long values equal to English fail). A file with the marker keeps the OLD page of that language (see build.py)
// 4. checkpages.py: every page exists and equals a fresh build, hreflang, canonical, headings, JSON-LD, the sitemap, ...
const fs=require('fs'),path=require('path'),cp=require('child_process');
const src=path.join(__dirname,'..','src'),d=path.join(src,'lang')+'/';
const site=JSON.parse(fs.readFileSync(path.join(src,'site.json')));
const codes=site.languages.map(l=>l.code);
const en=JSON.parse(fs.readFileSync(d+site.default+'.json'));
function shape(o){return Array.isArray(o)?o.map(shape):(o&&typeof o==='object')?Object.fromEntries(Object.keys(o).sort().map(k=>[k,shape(o[k])])):(o===null?null:'s');}
let bad=0;
const have=fs.readdirSync(d).sort().join(),want=codes.map(c=>c+'.json').sort().join();
if(have!==want){console.log('LANGUAGE LIST DIFF: src/lang has',have,'but src/site.json lists',want);bad++;}
for(const c of codes){const f=c+'.json';if(c===site.default)continue;try{const t=JSON.parse(fs.readFileSync(d+f));
 const ok=JSON.stringify(shape(t))===JSON.stringify(shape(en));const tags=Object.keys(en).filter(k=>typeof en[k]==='string'&&((en[k].match(/<[^>]+>/g)||[]).join()!==((t[k]||'').match(/<[^>]+>/g)||[]).join()));
 console.log(f,ok?'shape ok':'SHAPE DIFF',tags.length?'TAG DIFF '+tags:'');if(!ok||tags.length)bad++;}catch(e){console.log(f,'INVALID',e.message);bad++;}}
for(const l of site.languages){const f=new Intl.DateTimeFormat(l.code,{weekday:'narrow'});const w=[0,1,2,3,4,5,6].map(i=>f.format(new Date(2024,0,1+i)));
 const ok=JSON.stringify(w)===JSON.stringify(l.week);if(!ok){console.log(l.code,'WEEK DIFF site.json has',l.week.join(''),'Intl gives',w.join(''));bad++;}}
const i18n=path.join(__dirname,'..','app','src','i18n')+'/';
const enNew=JSON.parse(fs.readFileSync(i18n+'en.json'));
if(enNew._untranslated!==undefined){console.log('app/src/i18n/en.json must not carry _untranslated');bad++;}
const ph=v=>(String(v).match(/\{\w+\}/g)||[]).sort().join();
const marks=v=>['\\*\\*[^*]+\\*\\*','==[^=]+==','(?<![*])\\*[^*]+\\*(?![*])'].map(re=>(String(v).match(new RegExp(re,'g'))||[]).length).join();
const have2=fs.readdirSync(i18n).filter(f=>f.endsWith('.json')).sort().join(),want2=codes.map(c=>c+'.json').sort().join();
if(have2!==want2){console.log('I18N LIST DIFF: app/src/i18n has',have2,'but src/site.json lists',want2);bad++;}
for(const c of codes){if(c===site.default)continue;let t;try{t=JSON.parse(fs.readFileSync(i18n+c+'.json'));}catch(e){console.log('app i18n',c+'.json','INVALID',e.message);bad++;continue;}
 const problems=[];const un=t._untranslated;if(un!==undefined&&un!==true)problems.push('_untranslated must be true or absent');
 const ks=Object.keys(t).filter(k=>k!=='_untranslated'),ke=Object.keys(enNew);
 const missing=ke.filter(k=>!(k in t)),extra=ks.filter(k=>!(k in enNew));
 if(missing.length)problems.push('missing keys: '+missing.slice(0,8).join(' ')+(missing.length>8?' (+'+(missing.length-8)+')':''));
 if(extra.length)problems.push('extra keys: '+extra.slice(0,8).join(' '));
 const nonStr=ks.filter(k=>typeof t[k]!=='string');if(nonStr.length)problems.push('not a string: '+nonStr.slice(0,5).join(' '));
 const phd=ke.filter(k=>k in t&&ph(t[k])!==ph(enNew[k]));if(phd.length)problems.push('placeholders differ from English: '+phd.slice(0,8).join(' '));
 const mkd=ke.filter(k=>k in t&&marks(t[k])!==marks(enNew[k]));if(mkd.length)problems.push('inline marks differ from English: '+mkd.slice(0,8).join(' '));
 const tag=ks.filter(k=>/<\/?[a-zA-Z]/.test(String(t[k])));if(tag.length)problems.push('HTML in a value: '+tag.slice(0,5).join(' '));
 const empty=ks.filter(k=>String(t[k]).trim()==='');if(empty.length)problems.push('empty value: '+empty.slice(0,5).join(' '));
 if(!un){const long=ke.filter(k=>k in t&&String(enNew[k]).length>=30),same=long.filter(k=>t[k]===enNew[k]);
  if(same.length>long.length*0.1)problems.push('no _untranslated marker but '+same.length+' of '+long.length+' long values are still English');}
 console.log('app/src/i18n/'+c+'.json',problems.length?'PROBLEMS':(un?'parity ok, untranslated (old page)':'parity ok, translated (new design)'));
 for(const m of problems)console.log('  -',m);if(problems.length)bad++;}
const r=cp.spawnSync('python3',[path.join(__dirname,'checkpages.py')],{stdio:'inherit',env:Object.assign({},process.env,{PYTHONDONTWRITEBYTECODE:'1'})});
if(r.error){console.log('checkpages.py could not run:',r.error.message);bad++;}else if(r.status!==0)bad++;
process.exit(bad?1:0);
