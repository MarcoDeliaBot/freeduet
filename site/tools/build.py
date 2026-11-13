import re,sys,pathlib
s=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2])
body=(s/"body.html").read_text()
gh='<symbol id="i-gh" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></symbol>'
body=re.sub(r'<symbol id="i-gh".*?</symbol>',gh,body,flags=re.S)
import json
order=[("en","English"),("it","Italiano"),("es","Español"),("fr","Français"),("de","Deutsch"),("pt","Português"),("pl","Polski"),("tr","Türkçe"),("ru","Русский"),("zh","中文"),("ja","日本語"),("ko","한국어")]
T={c:json.loads((s/"lang"/(c+".json")).read_text()) for c,_ in order}
js="(function(){\n\"use strict\";\nvar GH=\"https://github.com/MarcoDeliaBot/freeduet\";\nvar LANGS="+json.dumps(order,ensure_ascii=False)+";\nvar T="+json.dumps(T,ensure_ascii=False,separators=(",",":")).replace("</","<\\/")+";\n"+(s/"app.js").read_text()+"\n})();"
html=f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreeDuet</title>
<meta name="description" content="FreeDuet is a free, open-source team of AI assistants that runs on your own computer and your own AI subscription. They ask before they send, pay, sign, book or delete.">
<meta property="og:title" content="FreeDuet: your own team of AI assistants">
<meta property="og:description" content="A free, open-source team of AI assistants. They ask before they send, pay, sign, book or delete.">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Schibsted+Grotesk:wght@700;800&display=swap" rel="stylesheet">
<style>
{(s/"style.css").read_text()}</style>
</head>
<body>
{body}
<script>
{js}
</script>
</body>
</html>
'''
o.write_text(html);print(len(html))
