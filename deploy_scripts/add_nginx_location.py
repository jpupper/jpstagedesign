#!/usr/bin/env python3
# ============================================================================
# Agrega el location /jpstagedesign al server block del VPS.
# LO CORRE EL USUARIO (ningun modelo de lenguaje toca nginx).
#
#   scp -P 5752 add_nginx_location.py root@149.50.139.152:/tmp/
#   ssh -p 5752 root@149.50.139.152 "python3 /tmp/add_nginx_location.py"
#   ssh -p 5752 root@149.50.139.152 "nginx -t && systemctl reload nginx"
#
# ⚠️ Edita /etc/nginx/sites-ENABLED/vps-4455523-x  (en este VPS ese archivo es
#    un archivo REAL, NO un symlink a sites-available: si editan el de
#    sites-available NO pasa nada).
# ⚠️ El backup va a /root/nginx-backups/, NUNCA a sites-enabled/ (un backup ahi
#    se carga como config y rompe nginx con "duplicate listen options").
# ============================================================================
import os, shutil, datetime, sys

# Uso normal (en el VPS, sin argumentos): edita el nginx real y respalda en /root/nginx-backups
# Uso de prueba (sin tocar el VPS): add_nginx_location.py <archivo> <dir_backup>
P = sys.argv[1] if len(sys.argv) > 1 else '/etc/nginx/sites-enabled/vps-4455523-x'
BACKUP_DIR = sys.argv[2] if len(sys.argv) > 2 else '/root/nginx-backups'

MARKER = 'APLICACION: JPStageDesign'

BLOCK = """
    # APLICACION: JPStageDesign (puerto 6645)
    location /jpstagedesign {
        proxy_pass http://localhost:6645;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        client_max_body_size 150M;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
    }
"""

if not os.path.exists(P):
    sys.exit('ERROR: no existe ' + P)

src = open(P, encoding='utf-8', errors='replace').read()

if MARKER in src:
    sys.exit('Ya existe el bloque de JPStageDesign en nginx. No se toco nada.')

# Anclaje: justo despues del bloque "location = /canasta" (ultimo location del
# server 443). Si no aparece, se inserta antes del ultimo cierre del server.
anchor = """    location = /canasta {
        return 301 /canasta/;
    }
"""

if anchor in src:
    out = src.replace(anchor, anchor + BLOCK, 1)
    how = 'despues del bloque location = /canasta'
else:
    # Fallback: antes del primer "server {" del redirect a 80
    fallback = "\nserver {\n    if ($host = vps-4455523-x.dattaweb.com) {"
    if fallback not in src:
        sys.exit('ERROR: no se encontro un anclaje seguro. Insertar a mano.')
    out = src.replace(fallback, BLOCK + fallback, 1)
    how = 'antes del server block del puerto 80'

os.makedirs(BACKUP_DIR, exist_ok=True)
stamp = datetime.datetime.now().strftime('%Y-%m-%d-%H%M')
bak = os.path.join(BACKUP_DIR, 'vps-4455523-x.bak-' + stamp)
shutil.copy2(P, bak)

open(P, 'w', encoding='utf-8').write(out)

print('OK: bloque insertado (%s)' % how)
print('Backup: ' + bak)
print('Ahora:  nginx -t && systemctl reload nginx')
