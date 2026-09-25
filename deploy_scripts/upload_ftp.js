require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');

async function syncLocalToRemote(client, localFolder, remoteFolder) {
    await client.ensureDir(remoteFolder);
    await client.cd(remoteFolder);

    const remoteList = await client.list();
    const remoteMap = new Map();
    for (const item of remoteList) {
        remoteMap.set(item.name, item);
    }

    const localItems = fs.readdirSync(localFolder);

    for (const item of localItems) {
        const localPath = path.join(localFolder, item);
        const stat = fs.statSync(localPath);

        if (stat.isDirectory()) {
            await syncLocalToRemote(client, localPath, remoteFolder + '/' + item);
            await client.cd(remoteFolder);
        } else {
            const remoteItem = remoteMap.get(item);
            if (!remoteItem || remoteItem.size !== stat.size) {
                console.log('[SUBIENDO] ' + remoteFolder + '/' + item);
                await client.uploadFrom(localPath, item);
            }
        }
    }
}

async function uploadToFtp() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    const ftpHost = process.env.FTP_HOST || 'fullscreencode.com';
    const ftpUser = process.env.FTP_USER;
    const ftpPassword = process.env.FTP_PASS;

    if (!ftpUser || !ftpPassword) {
        console.error('[FTP] Faltan credenciales en .env (FTP_USER, FTP_PASS)');
        process.exit(1);
    }

    try {
        console.log('--- Iniciando conexion FTP ---');
        console.log('Comparando archivos... Solo subiendo lo modificado o nuevo.');

        await client.access({
            host: ftpHost,
            user: ftpUser,
            password: ftpPassword,
            secure: true
        });

        const localPublicFolder = path.join(__dirname, '..', 'public');
        const remoteDir = '/futurex';

        console.log('Sincronizando ' + remoteDir + '...');
        await syncLocalToRemote(client, localPublicFolder, remoteDir);

        console.log('==========================================');
        console.log('Sincronizacion FTP completada con exito!');
        console.log('==========================================');

    } catch (err) {
        console.error('[FTP] Error en la subida:', err.message);
        process.exit(1);
    } finally {
        client.close();
    }
}

uploadToFtp();
