#!/usr/bin/env python3
"""
Sube el frontend de JPStageDesign al FTP de Ferozo (dual-hosting FSC).
Corre desde el VPS para evitar el rate-limit por IP de Ferozo.
Fuente: /tmp/jpstage_public/
Destino FTP: /public_html/jpstagedesign/
"""
import ftplib, ssl, io, os, sys

SRC = '/tmp/jpstage_public'
DST = '/public_html/jpstagedesign'
HOST = 'c1700065.ferozo.com'
USER = 'c1700065'
PASS = 'Sarosa2026*Sarosa2026*'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
ftp = ftplib.FTP_TLS(context=ctx)
ftp.connect(HOST, 21, timeout=40)
ftp.login(USER, PASS)
ftp.prot_p()

# --- Crear arbol de directorios remoto ---
def ensure(path):
    parts = [p for p in path.split('/') if p]
    cur = ''
    for p in parts:
        cur = cur + '/' + p
        try:
            ftp.mkd(cur)
        except ftplib.error_perm:
            pass

ensure(DST)
for root, dirs, files in os.walk(SRC):
    rel = os.path.relpath(root, SRC).replace('\\', '/')
    remote_dir = DST if rel == '.' else DST + '/' + rel
    ensure(remote_dir)

# --- Subir archivos ---
ok = 0
fail = []
for root, dirs, files in os.walk(SRC):
    rel = os.path.relpath(root, SRC).replace('\\', '/')
    remote_dir = DST if rel == '.' else DST + '/' + rel
    for fn in sorted(files):
        local = os.path.join(root, fn)
        with open(local, 'rb') as fh:
            data = fh.read()
        remote = remote_dir + '/' + fn
        try:
            ftp.storbinary('STOR ' + remote, io.BytesIO(data))
            size = ftp.size(remote)
            if size == len(data):
                ok += 1
                print('OK   %-52s %8d b' % (remote, size))
            else:
                fail.append((remote, size, len(data)))
                print('MAL  %-52s remoto=%s local=%s' % (remote, size, len(data)))
        except Exception as e:
            fail.append((remote, str(e), len(data)))
            print('ERR  %-52s %s' % (remote, e))

ftp.quit()
print('\n=== TOTAL: %d subidos OK, %d con problema ===' % (ok, len(fail)))
sys.exit(1 if fail else 0)
