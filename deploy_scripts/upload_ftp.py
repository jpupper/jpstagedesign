# ============================================================
# FUTUREX - Carga de Frontend via FTP FTPS (Ferozo)
# ============================================================
import ftplib, ssl, os

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

ftp = ftplib.FTP_TLS(context=ctx)
ftp.connect('fullscreencode.com', 21)
ftp.login('jpupper@jeyder.com.ar', 'Sarosa2025')
ftp.prot_p()
ftp.set_pasv(True)

# Directorio remoto objetivo en Ferozo
base_remote = '/futurex'
try:
    ftp.mkd('futurex')
    print('[FTP] Directorio /futurex listo')
except:
    pass

# Ruta absoluta al directorio public
base_local = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public'))

for root, dirs, files in os.walk(base_local):
    for file in files:
        local_path = os.path.join(root, file)
        rel_path = os.path.relpath(local_path, base_local).replace('\\', '/')
        remote_path = base_remote + '/' + rel_path
        
        # Crear subdirectorios en el servidor FTP si no existen
        remote_dir = os.path.dirname(remote_path)
        try:
            ftp.mkd(remote_dir)
        except:
            pass
        
        with open(local_path, 'rb') as f:
            ftp.storbinary(f'STOR {remote_path}', f, 8192)
            print(f'[FTP] OK: {remote_path}')

ftp.quit()
print('=== [FTP] SINCRONIZACIÓN EXITOSA COMPLETADA ===')
