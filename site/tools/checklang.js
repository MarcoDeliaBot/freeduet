const fs=require('fs');const d=require('path').join(__dirname,'..','src','lang')+'/';const en=JSON.parse(fs.readFileSync(d+'en.json'));
function shape(o){return Array.isArray(o)?o.map(shape):(o&&typeof o==='object')?Object.fromEntries(Object.keys(o).sort().map(k=>[k,shape(o[k])])):(o===null?null:'s');}
let bad=0;for(const f of fs.readdirSync(d)){if(f==='en.json')continue;try{const t=JSON.parse(fs.readFileSync(d+f));
 const ok=JSON.stringify(shape(t))===JSON.stringify(shape(en));const tags=Object.keys(en).filter(k=>typeof en[k]==='string'&&((en[k].match(/<[^>]+>/g)||[]).join()!==((t[k]||'').match(/<[^>]+>/g)||[]).join()));
 console.log(f,ok?'shape ok':'SHAPE DIFF',tags.length?'TAG DIFF '+tags:'');if(!ok||tags.length)bad++;}catch(e){console.log(f,'INVALID',e.message);bad++;}}
process.exit(bad?1:0);
