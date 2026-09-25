#!/bin/bash
# ============================================================
# FUTUREX - Script de actualización en VPS
# Lee GITHUB_TOKEN desde variable de entorno
# ============================================================
echo "=== ACTUALIZANDO FUTUREX EN VPS ==="

# Buscar directorio de la aplicación
APP_DIR=""
if [ -d "/root/botonera-futurex" ]; then
    APP_DIR="/root/botonera-futurex"
elif [ -d "/root/futurex" ]; then
    APP_DIR="/root/futurex"
elif [ -d "/var/www/futurex" ]; then
    APP_DIR="/var/www/futurex"
fi

# Si no existe, clonar
if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
    echo "[VPS] No se encontró el directorio. Clonando..."
    cd /root
    
    if [ -n "$GITHUB_TOKEN" ]; then
        git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/jpupper/telo.git" botonera-futurex 2>&1
    else
        git clone https://github.com/jpupper/telo.git botonera-futurex 2>&1
    fi
    
    if [ $? -ne 0 ] || [ ! -d "/root/botonera-futurex" ]; then
        echo "[ERROR] No se pudo clonar. Verificando conexion..."
        exit 1
    fi
    APP_DIR="/root/botonera-futurex"
fi

cd "$APP_DIR"
echo "[VPS] Directorio encontrado: $APP_DIR"

# Verificar si es un repo git
if [ ! -d ".git" ]; then
    echo "[VPS] Iniciando repositorio git..."
    git init
    git remote add origin "https://github.com/jpupper/telo.git" 2>/dev/null
fi

# Actualizar desde GitHub
echo "[VPS] Obteniendo ultima version..."

git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null
if [ $? -eq 0 ]; then
    git reset --hard origin/main 2>/dev/null || git reset --hard origin/master 2>/dev/null
    echo "[VPS] Codigo actualizado."
else
    echo "[WARN] No se pudo conectar con GitHub, continuando con codigo local..."
fi

# Instalar dependencias
echo "[VPS] Instalando dependencias..."
npm install --production

# Reiniciar PM2
echo "[VPS] Reinstanciando PM2..."
pm2 restart futurex 2>/dev/null || pm2 start server.js --name "futurex"
pm2 save

echo "=== FUTUREX ACTUALIZADO EXITOSAMENTE EN VPS ==="
