// Checks the languages of the site, then runs checkpages.py on the built pages. Run it from anywhere:
//   node site/tools/checklang.js
// 1. the language files are exactly the languages listed in src/site.json (the one list the build and
//    checkpages.py also read), and each has the same keys and the same tags as the default language (English)
// 2. the weekday letters in src/site.json are what Intl gives for each language (the build writes them into the HTML)
// 3. checkpages.py: every page exists and equals a fresh build, hreflang, canonical, headings, JSON-LD, the sitemap, ...
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
const r=cp.spawnSync('python3',[path.join(__dirname,'checkpages.py')],{stdio:'inherit',env:Object.assign({},process.env,{PYTHONDONTWRITEBYTECODE:'1'})});
if(r.error){console.log('checkpages.py could not run:',r.error.message);bad++;}else if(r.status!==0)bad++;
process.exit(bad?1:0);
