#!/usr/bin/env python3
"""Prepara index.html para publicar: versión visible + cache-busting real.

El problema que resuelve
------------------------
index.html carga `js/app.js?v=<epoch>`, pero app.js importa los otros 47 módulos
con rutas estáticas SIN versión. El navegador se queda con la copia vieja de
cada uno: se publica un arreglo en apertura.js y el usuario sigue ejecutando el
de ayer, sin ningún indicio de que algo va mal.

La solución sin build: un import map que apunta cada módulo a su URL con la
versión. Los import maps aceptan especificadores tipo URL, así que `./js/x.js`
dentro de app.js queda redirigido a `./js/x.js?v=<epoch>`.

Uso:  python3 _release.py v2026.08.22-0130
"""
import json,os,re,sys,time

version=sys.argv[1] if len(sys.argv)>1 else 'v'+time.strftime('%Y.%m.%d-%H%M')
epoch=str(int(time.time()))
modulos=sorted(f for f in os.listdir('js') if f.endswith('.js'))

imports={f'./js/{m}':f'./js/{m}?v={epoch}' for m in modulos}
mapa=('<!-- Cache-busting: sin esto el navegador sirve los módulos viejos aunque\n'
      '     app.js sea nuevo. Lo genera _release.py en cada publicación. -->\n'
      '<script type="importmap">\n'
      +json.dumps({'imports':imports},indent=2,ensure_ascii=False)+
      '\n</script>')

s=open('index.html',encoding='utf-8').read()

# 1. Reemplazar (o insertar) el import map, siempre ANTES del script de app.js
s=re.sub(r'<!-- Cache-busting.*?</script>\n','',s,flags=re.S)
s=re.sub(r'<script type="importmap">.*?</script>\n','',s,flags=re.S)
anc=re.search(r'[ \t]*<script type="module" src="js/app\.js[^"]*"></script>',s)
if not anc: sys.exit('no se encontró el <script> de app.js')
s=s[:anc.start()]+mapa+'\n'+f'<script type="module" src="js/app.js?v={epoch}"></script>'+s[anc.end():]

# 2. Versión visible en la barra superior
s=re.sub(r'v20\d\d\.\d\d\.\d\d-\d{4}',version,s)

open('index.html','w',encoding='utf-8').write(s)

# 3. Nombre de la caché del service worker
#
# El service worker va siempre a la red primero, así que no puede servir código
# viejo. Pero la caché de respaldo sí guardaría los archivos de la versión
# anterior para el modo sin conexión: al cambiar el nombre en cada publicación,
# activate() la borra entera y se vuelve a llenar con lo recién publicado.
sw_path='sw.js'
if os.path.exists(sw_path):
    sw=open(sw_path,encoding='utf-8').read()
    sw2=re.sub(r"const CACHE\s*=\s*'[^']*';", f"const CACHE = 'contabilidad-{epoch}';", sw, count=1)
    if sw2==sw:
        sys.exit('no se pudo actualizar el nombre de caché en sw.js')
    open(sw_path,'w',encoding='utf-8').write(sw2)

print(f'{version} · {len(modulos)} módulos versionados · epoch {epoch}')
