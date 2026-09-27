# 🚀 JPStageDesign - Simulador y Diseñador de Escenarios Inmersivos & Ecosistema Fullscreen

**JPStageDesign** es un sistema inmersivo de diseño de escenarios, simulación tridimensional y control audiovisual en tiempo real. Permite diseñar libremente configuraciones de paredes y pantallas (tamaño, posición, rotación, escala, slice de video), añadir y orientar proyectores con cálculos fotométricos y conos de luz 3D, y sincronizar contenido (shaders WebGL procedurales, imágenes HD, videos locales y de YouTube) en vivo mediante una arquitectura **MASTER (Botonera tablet de control)** / **SLAVE (Output de proyección / Simulador 3D / Presupuesto técnico)**.

---

## 📐 1. Visión General y Arquitectura

JPStageDesign opera mediante una arquitectura cliente-servidor basada en **Node.js, Express, Socket.IO, WebGL Vanilla y Three.js**.

```
                           ┌───────────────────────────────┐
                           │    Servidor Node.js (6645)    │
                           │      Express + Socket.IO      │
                           └───────────────┬───────────────┘
                                           │
            ┌──────────────────────────────┼──────────────────────────────┐
            ▼                              ▼                              ▼
 ┌──────────────────────┐      ┌──────────────────────┐      ┌───────────────────────────┐
 │    MASTER (Tablet)   │      │    SLAVE (Output)    │      │    SLAVE (Simulador 3D)   │
 │ /jpstagedesign/      │      │ /jpstagedesign/output│      │ /jpstagedesign/output3d   │
 │ (Botonera & Control) │      │ (Proyector/Pantalla) │      │ (Diseño de Escenario 3D)  │
 └──────────────────────┘      └──────────────────────┘      └───────────────────────────┘
```

### Roles y Módulos del Sistema:
1. **MASTER (Botonera Tablet de Control)**: `http://localhost:6645/jpstagedesign/`
   * **Modo User**: Interfaz táctil sobria con botones de escenas activas en vivo.
   * **Logo Personalizado**: Logo de JPStageDesign con opción de subir logo propio de marca/cliente en tiempo real desde el menú Avanzado.
   * **Modo Advanced**: Gestión de la biblioteca de inputs (subida de imágenes/videos por Drag & Drop o URL, shaders WebGL procedurales en vivo, **páginas web por URL**, reasignación de botones).
     * Selector de **tipo de input** al agregar por URL: `Auto-detectar` / `Página Web` / `Imagen` / `Video (archivo)` / `YouTube`.
     * En modo Auto, una URL sin extensión de archivo se interpreta como **página web** y queda guardada en INPUTS (grupo *Páginas Web* en la asignación de botones); al dispararla, el **Output** la embebe en un `<iframe>` a pantalla completa.
   * **Selector de Estilo Visual** (arriba a la derecha):
     `Claro` / `Oscuro` / `Matrix` / **`✧ Minimal Neon`**. La tipografía de la interfaz es estilo
     **consola retro** (monoespaciada). La preferencia se guarda en `localStorage` (`fsc_theme`).
     * **Matrix** — fondo negro absoluto, **sólo los bordes en verde** (`#00ff41`), **letras blancas** y
       fondos de contenedores/inputs en **negro puro**, con scanlines muy sutiles.
     * **Minimal Neon** — negro profundo, líneas finas de 1px cian/magenta (acentos), sin glow agresivo.
     * Los temas se aplican con clases en el `<body>` (`dark-mode` / `matrix-mode` / `neon-mode`) desde
       `applyStyle()` en `menu.js`; agregar un tema nuevo son 3 lugares: `THEME_CLASSES` + `VALID_STYLES`,
       la `<option>` del `#styleSelect` en `index.html`, y el bloque CSS `body.menu-body.<tema>-mode`.
   * **Configuración de Sala**: Medidas de habitación (largo, ancho, alto) y selección de modo de mapeo
     (**🪞 Espejo** vs **🧩 Reparto** — ver más abajo).

2. **SLAVE (Simulador 3D & Diseñador de Escenarios)**: `http://localhost:6645/jpstagedesign/output3d.html`
   * **Panel de Control (ADMIN) a la IZQUIERDA y ANCHO**: el panel de diseño está anclado a la izquierda
     (la barra táctil de Modo User también vive a la izquierda; se ocultan por turnos), con ~520 px de ancho.
   * **Panel organizado en TABS**: `🗂️ Jerarquía`, `📐 Medidas` (incluye la 🔲 **Grilla del Piso**), `🖥️ Pantallas`,
     `📽️ Proyectores`, `🌐 Mapeo`, `🧊 3D` (objetos OBJ/GLB), `🎨 Contenido`, `💾 Guardar`, `💼 Presupuesto`.
     La tab activa se recuerda en `localStorage`.
   * **Escenario totalmente vaciable**: se pueden borrar **todas** las pantallas, **todos** los proyectores y
     **todos** los objetos 3D sin ningún aviso ni bloqueo. La escena vacía se persiste y al recargar sigue vacía
     (no se autoregeneran pantallas por defecto ni al actualizar dimensiones). Cada lista y la jerarquía muestran
     su propio estado vacío.
   * **El TECHO de la sala fue ELIMINADO por completo**: no se dibuja nunca (material `visible: false`) y
     no recibe contenido. En la escena sólo se ve lo que agregás vos: pantallas, teles, proyectores y objetos 3D.
     Se quitaron del panel los controles *Proyectar en Techo* / *Opacidad Techo* y el botón **👀 Techo** de la
     barra inferior. El presupuesto ya no suma la superficie del techo.
   * **🗺️ MOTOR DE MAPEO DE CONTENIDO (reprogramado)** — decide qué región del contenido va a cada destino:
     * **🪞 ESPEJO (DEFAULT)** — *toda* pantalla (LED), telé touch y proyector muestra el **100%** del contenido
       disparado desde la botonera. Si cambiás el contenido, **todos** los destinos cambian igual.
     * **🧩 REPARTO** — cada pantalla muestra su **slice (1..4)** de la fuente panorámica 4x1 (muro de 4
       proyectores). Sólo corta las pantallas con slice explícito; las que están en *Completo* siguen duplicando.
     * Implementación: una única fuente de verdad, `resolveSourceRect(item, index, srcW, srcH)`, usada por
       **todos** los tipos de contenido (shader, imagen, video, YouTube, web) vía `updateWallTextures()`.
       El default de slice al crear una pantalla es `-1` (**Completo**), nunca el reparto automático.
     * **Persistencia y convergencia**: el modo vive en `localStorage.fsc_mapping_mode` (mismo origen que la
       botonera, el 3D y las salidas), **no** en la config de la sala — así una config vieja no puede revivir
       el reparto. El servidor lo mantiene en memoria y lo difunde (`masterStatus` / `mappingModeChanged`).
       Si el navegador tiene una elección distinta a la del servidor (p. ej. tras reiniciar el server), el
       navegador la empuja al servidor para que **todos los outputs queden sincronizados**.
     * **UI**: tab `🌐 Mapeo` con los dos modos, explicación contextual y dos presets explícitos
       (**🪞 Aplicar ESPEJO a todo** / **🧩 Aplicar REPARTO 4 vías**). Botón **🪞 Espejo / 🧩 Reparto** en la
       barra inferior. Cada tarjeta de pantalla muestra su badge de mapeo.
     * **Screen Sync (🔄)**: hace que una pantalla sólo se encienda si un proyector la apunta. **Sólo aplica a
       pantallas tipo "Con Proyector"** — las **LED** y las **teles touch** son autoemisivas y reproducen siempre
       el contenido de la botonera, aunque ningún proyector las apunte.
     * **Gizmo**: flechas estándar de un solo sentido (una por eje) en mover/rotar/escalar, como en cualquier
       programa 3D. Ojo: `public/js/TransformControls.js` es una copia local parcheada — no la reemplaces a ciegas.
     * **Salida limpia (`/output/`)**: en ESPEJO, todas las ventanas (incluso `?screen=1..4`) muestran el 100%;
       en REPARTO, cada `?screen=N` muestra su cuarto. La clase de corte la aplica `output.js` según el modo.
   * **🗂️ Tab Jerarquía + Inspector (estilo Unity)** — es la tab por defecto:
     * **Jerarquía**: lista **plana** con **TODOS** los elementos de la escena (sin subgrupos por tipo), con el
       total en el encabezado `ESCENA`. Cada fila tiene ojo (ocultar/mostrar) y papelera.
     * **Selección bidireccional**: clickear una fila selecciona el elemento en la escena 3D (enciende el gizmo),
       y clickear en el viewport 3D resalta la fila correspondiente y la mantiene visible.
     * **Inspector**: panel derecho con las propiedades del seleccionado, editable en vivo —
       Nombre, Tipo (LED/Tele Touch/Con Proyector), Tamaño, Slice, "Apunta a", Precio, Haz (distancia/ángulo),
       Escala, **Posición X/Y/Z** y **Rotación X/Y/Z**, más acciones (`🎯 Centrar`, `📋 Duplicar`, `↺ Reset`,
       `👁️ Visible/Oculto`, `🗑️ Eliminar`). Los cambios se reflejan en el 3D y en las otras tabs al instante.
   * **Botón rápido `＋`** (en el encabezado del panel): agrega a la escena **Pantalla / Pared** (abre el selector
     LED · Tele Touch · Con Proyector), **Proyector**, o **Modelo 3D** (abre el selector de archivos .obj/.glb/.gltf).
     Salta automáticamente a la tab correspondiente.
   * **Selección en la escena + `Supr` para borrar**: clickeá cualquier elemento en el viewport 3D
     (pantalla, proyector u objeto 3D) para seleccionarlo — la selección es **mutuamente excluyente** y
     enciende el gizmo. Con el elemento seleccionado, **`Supr` / `Delete` lo elimina** (sólo en modo ADMIN;
     en modo User la tecla no hace nada).
   * **`ALT` + click = DUPLICAR** (en el viewport 3D): mantené apretado **ALT** y clickeá una **pantalla**,
     un **proyector** o un **objeto 3D** y se crea una copia desplazada, que queda seleccionada al instante.
     Es el camino rápido para armar repeticiones; el click normal (sin ALT) sigue seleccionando.
     Implementación: `onCanvasPointerDown()` detecta `event.altKey` sobre el raycast y llama a
     `duplicateScreen()` / `duplicateProjectorById()` / `duplicateFurnitureItem()`.
   * **💾 Tab Guardar — TEMPLATES DE ESCENARIO**: guardá el escenario completo con un nombre y recargalo cuando
     quieras (lista con fecha + cantidad de pantallas/proyectores/objetos, botones *Cargar* y *eliminar*).
     API: `GET/POST /api/templates`, `GET/DELETE /api/templates/:slug` (archivos en `data/templates/*.json`).
     Se mantienen el guardado en servidor y la importación/exportación de JSON suelta.
   * **🛏️ Tab Mobiliario — Importador OBJ/GLB con MÚLTIPLES objetos**:
     * `＋ AGREGAR OBJ / GLB 3D` sube modelos **`.obj`, `.glb`, `.gltf` de hasta 120 MB** (más `.mtl` y texturas
       de acompañamiento: subilos con el mismo nombre para que se apliquen).
     * Lista de objetos estilo *pantallas/proyectores*: seleccionar, ocultar (👁️), eliminar (🗑️), agregar varios.
     * Transformación individual del objeto seleccionado: Escala, Rotación X/Y/Z, Posición X/Y/Z + `↺ Reset`.
     * Botón `🛏️ Cama` para reinsertar el modelo por defecto. `API: POST/GET /api/models`.
     * Los objetos se guardan en la config (`furniture: [...]`) y se migran automáticamente desde el formato
       legacy (`bed`) de versiones anteriores.
   * **🔒 LOCK SOURCE por elemento** (tab `🗂️ Jerarquía` → seleccionar → Inspector):
     cada **pantalla / tele / proyector** puede quedar **fijo en un input**. Con el lock activo el
     elemento **deja de responder a los sockets de la botonera** (sceneChanged, sceneCleared y
     blackout) y reproduce **siempre** ese input, al 100%.
     * En el Inspector aparece la sección **Lock Source**: un toggle **🔓 OFF / 🔒 ON** y un
       **dropdown con todos los inputs** de la biblioteca, agrupados por tipo
       (✨ Efectos/Shaders · 🖼️ Imágenes · 🎥 Videos · 🎬 YouTube · 🌐 Páginas Web).
     * El dropdown se habilita al activar el lock; elegir otro input cambia el fijo. La fila de la
       jerarquía muestra un **candadito 🔒** para saber de un vistazo qué está lockeado.
     * Cada elemento lockeado tiene su **propio runtime** (canvas + textura) — imagen, video, shader
       WebGL propio, YouTube o página web — así puede mostrar algo distinto al resto de la escena
       **al mismo tiempo**. Los **haces de los proyectores** también proyectan la textura del lock.
     * Se respeta en: `sceneCleared` y **blackout** (sólo apagan los elementos SIN lock), el motor de
       mapeo (el lock va al 100%, sin slices) y la capa CSS3D de páginas web en vivo.
     * Se persiste en la config de la sala (`screens[].lockSource` / `projectors[].lockSource`, con
       el snapshot del input) → sobrevive recargas, templates y `roomConfig`.
   * **🌐 PÁGINAS WEB EN VIVO EN EL 3D (capa CSS3D)** — las páginas web ya **no** son un cartel simbólico:
     se monta un `<iframe>` **real** encima del canvas WebGL, en una capa CSS3D (`public/js/CSS3DRenderer.js`,
     copia local de three.js r128) que usa **la misma cámara** que la escena. La página se ve **en vivo y en
     perspectiva**, pegada a cada pantalla que esté mostrando contenido web, y se mueve con la órbita.
     * El viewport del iframe usa **la misma proporción que la pantalla** (`WEB_LAYER_VW = 1600`), así la
       página **no se deforma**. La escala CSS3D es uniforme: `w / 1600`.
     * **Respeta el motor de mapeo**: en 🧩 REPARTO el iframe mide 4× y se desplaza para mostrar el slice
       que le toca (usa la misma función `resolveSourceRect`). En 🪞 ESPEJO muestra la página completa.
     * **Respeta Screen Sync**: sólo aplica a pantallas tipo *Con Proyector* (LED/touch son autoemisivas).
     * Botón **🌐 Web Live** en la barra inferior: prende/apaga la capa (si la apagás volvés al cartel
       de referencia). La capa tiene `pointer-events: none` para no robarle el mouse a la órbita ni al gizmo.
     * Si una web **bloquea** su carga en iframe (`X-Frame-Options` / `CSP`), el cartel de referencia queda
       visible detrás (fondo transparente) y lo avisa explícitamente — es una limitación del sitio, no del app.
     * La **salida limpia** (`/output/`) ya embebía la web a pantalla completa desde antes (`renderWeb` en `output.js`).
   * **Diseño Dinámico de Pantallas y Paredes**:
     * Agregar y quitar paredes/pantallas libremente (`＋ AGREGAR PANTALLA / PARED`).
     * **Tipo de pantalla** al agregar (modal de elección) y editable luego desde el panel:
       * 🟩 **Pantalla LED** — panel de píxeles (trama LED 3D). No requiere proyector.
       * 📱 **Tele Touch** — monitor/pantalla táctil con marco y cámara. No requiere proyector.
       * 🎦 **Pantalla con Proyector** — superficie de proyección; al crearla o al cambiar el tipo a *Proyector* se **agrega automáticamente un proyector** apuntándola.
     * Presets rápidos: `4 Paredes (Perímetro)`, `U-Stage (3 Paredes)`, `Frontal Única`.
     * Control exacto por pantalla: **Ancho (m), Alto (m) y LARGO (m)** — las **3 dimensiones**, porque las
       teles/LED suelen ser más gruesas que una placa fina. El **Largo** es la profundidad del chasis
       (`screen.depth`): si no lo tocás se usa el grosor por defecto del tipo (LED 0.07 m · Tele Touch 0.09 m ·
       Con Proyector 0.04 m). Junto con Posición X/Y/Z, Rotación X/Y/Z y el slice de contenido
       (Slice 1 a 4, o Completo). Se persiste en la config de la sala (`screens[].depth`).
     * Manipulación directa en 3D con Gizmo interactivo (Trasladar / Rotar).
     * Mute / Ocultar pantalla, duplicar pantalla y centrar en el espacio.
     * Etiquetas dimensionales 3D flotantes con medidas exactas y nombre de pantalla.
   * **Simulador de Proyectores 3D**:
     * Botón `＋ PANTALLA` accesible directamente desde el panel de proyectores.
     * Apuntado automático a cualquier pantalla o pared seleccionada (`🎯 APUNTAR A PANTALLA`).
     * Cálculo de luxes, distancia de tiro, tamaño proyectado y relación de aspecto.
     * Conos volumétricos 3D translúcidos.
     * **Escenario sin proyectores**: se pueden borrar **todos** los proyectores y el sistema sigue funcionando (útil para montajes 100% LED / Tele Touch). La lista vacía se persiste y no se autoregeneran al recargar.
   * **Presupuesto Técnico Automatizado**:
     * Integración con módulo de cotización y especificaciones de equipamiento: `http://localhost:6645/jpstagedesign/presupuesto.html`.

3. **SLAVE (Output Limpio de Proyección)**: `http://localhost:6645/jpstagedesign/output/`
   * Salida pura a pantalla completa para alimentar proyectores reales, procesadores LED o sistemas de mapping.

---

## 📂 2. Estructura del Proyecto

```text
/jpstagedesign
├── /.env                     # Configuración de puerto (6645) y base path (/jpstagedesign)
├── /data/
│   ├── materials.json        # Biblioteca de materiales y asignación de botones
│   ├── room3d_config.json    # Configuración de escenario 3D (pantallas, proyectores, etc.)
│   └── settings.json         # Ajustes de sistema (logo personalizado, etc.)
├── /public/
│   ├── index.html            # Botonera Tablet (Master)
│   ├── output3d.html         # Simulador y Diseñador 3D de Escenarios
│   ├── output.html           # Output Limpio para Proyectores
│   ├── presupuesto.html      # Generador de Presupuestos Técnicos
│   ├── css/                  # Estilos visuales Dark Mode / Glassmorphism
│   ├── js/                   # Controladores (menu.js, output.js, config.js, shaders.js)
│   ├── img/                  # Logos (SVG oficiales JPStageDesign)
│   └── shaders/              # Shaders GLSL procedurales en tiempo real
├── /lib/
│   └── installation.js       # MOTOR DE INSTALACIONES: layouts + generador de escenario (puro)
├── /tests/                   # Verificación: engine, mcp, socket en vivo, gate de sintaxis
├── agent_api.js              # API REST de alto nivel para agentes (/api/agent/*)
├── mcp-server.js             # Servidor MCP (stdio, sin dependencias) para agentes LLM
├── server.js                 # Servidor HTTP + WebSocket Socket.IO (Port 6645)
├── run.bat                   # Lanzador en 1 clic para Windows (mata procesos y levanta servidor)
└── install.bat               # Instalador de dependencias npm
```

---

## 🚀 3. Inicio Rápido

### Instalación:
```bash
npm install
```

### Ejecutar Servidor:
Doble clic en `run.bat` o:
```bash
npm start
# O: node server.js
```

El servidor iniciará en:
* **Botonera Tablet:** `http://localhost:6645/jpstagedesign/`
* **Diseñador y Simulador 3D:** `http://localhost:6645/jpstagedesign/output3d.html`
* **Output Pantalla Completa:** `http://localhost:6645/jpstagedesign/output/`
* **Presupuesto Técnico:** `http://localhost:6645/jpstagedesign/presupuesto.html`

---

## 🤖 4. API PARA AGENTES + MCP (diseño automático de instalaciones)

Permite que un **agente LLM** diseñe el escenario solo: le pasás **un link o una imagen** (y opcionalmente
cuántas pantallas y de qué tipo) y el sistema **distribuye automáticamente** los destinos en el espacio —
elige paredes, dimensiona las pantallas, las posiciona y orienta, genera los proyectores necesarios y
asigna el contenido. Después lo **persiste** y lo **refresca EN VIVO** en todas las vistas abiertas
(botonera, 3D y output limpio), sin recargar nada.

Arquitectura: `lib/installation.js` (motor puro de layouts) → `agent_api.js` (REST, montada por `server.js`)
→ `mcp-server.js` (MCP stdio, cero dependencias).

### 4.1 Motor de layouts

| `layout` | Qué arma |
|---|---|
| `auto` (default) | 1 → frontal · 2 → duo · 3 → u-stage · 4 → perímetro · +4 → perímetro |
| `frontal` | fila de pantallas centrada en la pared frontal |
| `duo` | 2 pantallas lado a lado al frente |
| `u-stage` | frontal + pared izquierda + pared derecha |
| `perimeter` | las 4 paredes |
| `led-wall` | muro LED continuo de N paneles (sin separación) sobre el frente |
| `grid` | grilla `count` × `cols` sobre el frente |

Tipo de destino (`screenType`): `led` · `touch` · `projector` (este último **agrega un proyector que la apunta**) ·
**`calco`** (🖼️ **imagen pegada al escenario** — vinilo/sticker/captura; ver 4.5).
Modo de asignación (`assign`): `lock` (cada pantalla queda **fija** a un input, rotando la lista y sin depender de la botonera) ·
`first` (todas al primero) · `buttons` (a los 6 botones) · `none`.

**`clear` (importante):** por defecto `false` ⇒ la instalación **SE SUMA** a lo que ya hay en la escena
(las pantallas y calcos previos se conservan tal cual, con sus locks e imágenes). Con `clear: true` se
arma una **escena limpia** (borra pantallas, calcos y proyectores previos).

**Input por pantalla:** cualquier entrada de `screens[]` acepta `input` (id, nombre o URL de la biblioteca)
para fijar **esa** pantalla a **ese** input; manda sobre el `assign` global. Es la forma de hacer
"3 teles, cada una con su propio contenido".

### 4.2 API REST (`/api/agent/*`)

Todos los endpoints existen con y sin el prefijo `/jpstagedesign`.

| Método | Endpoint | Qué hace |
|---|---|---|
| GET | `/api/agent/catalog` | Tipos, layouts, modos, sala actual, inputs disponibles (con ID), templates. **Consultar antes de diseñar.** |
| GET | `/api/agent/scene` | Escena actual (`?full=1` devuelve la config cruda). |
| POST | `/api/agent/installation` | **DISEÑO AUTOMÁTICO.** Body: `{ spec, dryRun?, saveAsTemplate?, assignButtons? }`. |
| POST | `/api/agent/inputs` | Agrega inputs a la biblioteca (`{inputs:[...]}` o `{url, name}`). |
| POST | `/api/agent/play` | Dispara un input en vivo (`{id\|name\|url}`, `{blackout:true}` o `{scene}`). |
| POST | `/api/agent/clear` | Vacía el escenario (`{target:"all"\|"screens"\|"projectors"}`). |
| POST | `/api/agent/template/save` · `/template/apply` | Guarda / carga la escena como template. |

**Ejemplo — "armá una instalación con este link en 3 pantallas LED":**

```bash
curl -X POST http://localhost:6645/jpstagedesign/api/agent/installation \
  -H "Content-Type: application/json" \
  -d '{
        "spec": {
          "name": "Stand Cliente X",
          "url": "https://fullscreencode.com/jpupper/nftsapps/pamilo/",
          "layout": "auto",
          "count": 3,
          "screenType": "led",
          "assign": "lock"
        }
      }'
```

Sala, muro LED de 4 paneles y perímetro con proyectores:

```json
{ "spec": { "layout": "led-wall", "count": 4, "width": 3, "height": 1.7,
            "content": [{"url": "https://.../video.mp4", "name": "clip"}],
            "assign": "first", "mappingMode": "extended" } }
```

**Campos de `spec`:** `name`, `url` (atajo de un input), `content[]`, `layout`, `screenType`, `count`, `cols`,
`width`, `height`, `depth`, `gap`, `yOffset`, `screens[]` (definición explícita, con `wall: front|back|left|right`
o `position`/`rotation` absolutos), `assign`, `mappingMode` (`duplicated`=ESPEJO / `extended`=REPARTO),
`projectors` (bool), `clear` (bool: arranca de escena vacía), `room: {length,width,height}` **en centímetros**.

`dryRun: true` devuelve el diseño calculado sin escribir nada (útil para iterar antes de aplicar).

### 4.3 Servidor MCP (`mcp-server.js`)

Servidor MCP por **stdio**, sin dependencias (JSON-RPC 2.0 newline-delimited). Requiere el servidor de
JPStageDesign corriendo (es el que persiste y refresca el 3D que el usuario ve).

Herramientas expuestas: `jpstage_catalog`, `jpstage_get_scene`, `jpstage_design_installation`,
`jpstage_add_input`, `jpstage_play`, `jpstage_clear_stage`, `jpstage_list_templates`,
`jpstage_save_template`, `jpstage_apply_template`.

Variables de entorno: `JPSTAGE_URL` (default `http://localhost:6645`), `JPSTAGE_BASE` (default `/jpstagedesign`).

Registro en **Hermes Agent** (`~/.hermes/config.yaml`, clave `mcp_servers`):

```yaml
mcp_servers:
  jpstagedesign:
    command: node
    args:
      - D:/Programacion/sistemasfullscreen/jpstagedesign/mcp-server.js
    env:
      JPSTAGE_URL: http://localhost:6645
      JPSTAGE_BASE: /jpstagedesign
    timeout: 60
    connect_timeout: 30
```

O por CLI (recomendado, valida la conexión y descubre las 9 herramientas):

```bash
hermes mcp add jpstagedesign --command node --connect-timeout 30 \
  --env JPSTAGE_URL=http://localhost:6645 JPSTAGE_BASE=/jpstagedesign \
  --args D:/Programacion/sistemasfullscreen/jpstagedesign/mcp-server.js
```

Las herramientas quedan disponibles como `mcp_jpstagedesign_jpstage_design_installation`, etc.
(requiere reiniciar la sesión de Hermes). Cliente MCP genérico (Claude Desktop / Cursor): mismo bloque
`command`/`args`/`env` en su propio formato de config.

### 4.4 Verificación

```bash
npm run test:engine     # motor de layouts + calcos (no necesita servidor)
npm run test:mcp        # protocolo MCP: initialize + tools/list + tools/call
npm run test:socket     # E2E en vivo (guarda y RESTAURA el escenario del usuario)
npm run test:syntax     # gate de sintaxis del <script> inline de output3d.html
npm run test:cdp        # Chrome headless: la escena se actualiza EN VIVO sin recargar
npm run test:cdp-net    # Chrome headless + CDP Network: qué imágenes pide la página
npm run test:cdp-3d     # Chrome headless: cuenta la jerarquía y saca captura del 3D
npm run test:preset     # Chrome headless: el link ?preset=<slug> carga y NO escribe el servidor
npm run test:gizmo      # Chrome headless: la P abre el panel en el preset + el gizmo mueve el objeto 3D
npm run test:tint       # Chrome headless: color plano/silueta del objeto 3D (se pinta y se guarda)
npm run shoot           # capturas de otra app web (por defecto Sincretismo :6932)
                        #   filtrable por id:  node tests/shoot_sincretismo.js <outdir> log cluster3d
                        #   el id `log` emite un ciclo real por el bus antes de capturar
```

⚠️ `test:socket` escribe en el escenario real para probar el refresco en vivo; hace backup de la config
al arrancar y la restaura al terminar (pase o falle).

`test:cdp-net` es el que **prueba de verdad que un calco carga su imagen**: escucha el dominio `Network`
de Chrome DevTools y lista todas las requests a `/uploads/`. Un calco cuya imagen no se use en ninguna
pantalla tiene que aparecer ahí — si no aparece, el calco no está montando su textura
(fue el bug real: un `return` de más en `rebuildScreens3D` salteaba la creación del mesh).

### 4.5 🖼️ CALCOS — imágenes pegadas al escenario

Un **calco** es una imagen estática pegada a una pared, al piso o flotando (vinilo, sticker, gráfica,
captura de pantalla). Los PNG con alfa se recortan de verdad. **No es un destino de contenido**: no
recibe nada de la botonera, no tiene canvas, no se reparte por slices y ningún proyector lo apunta.

- **UI**: `＋ → 🖼️ Calco / Imagen`, o `＋ → Pantalla / Pared → 🖼️ Calco (imagen)`, o cambiar el
  `Tipo` de un elemento a `Calco` (te pide la imagen enseguida). El selector de imagen acepta
  **subir un archivo**, **pegar una URL** o **elegir una imagen de la biblioteca**.
  En el Inspector (tab 🗂️ Jerarquía) tiene: *Imagen* (cambiar), *Tamaño*, *Opacidad*, posición, rotación y escala.
  El tamaño se ajusta solo a la proporción real de la imagen (salvo que toques el ancho/alto a mano).
- **API**:
  ```json
  { "spec": {
      "calcos": [
        { "image": "https://…/logo.png", "name": "Vinilo", "wall": "left", "width": 3.2, "height": 1.8, "opacity": 0.95 },
        { "image": "Sincretismo · Cluster 3D", "width": 2.4, "height": 1.35,
          "position": { "x": 2.4, "y": 0.015, "z": 4.0 }, "rotation": { "x": -90, "y": 0, "z": 0 } }
      ] } }
  ```
  `image` acepta una **URL**, la **ruta de un archivo local** (`path`) o el **id/nombre de un input** de
  la biblioteca. También se puede declarar un calco dentro de `screens[]` con `screenType: "calco"`.
- **Registrar archivos locales** (capturas, renders):
  ```bash
  curl -X POST http://localhost:6645/jpstagedesign/api/agent/inputs \
    -H "Content-Type: application/json" \
    -d '{"inputs":[{"path":"C:/ruta/captura.png","name":"Captura 1","type":"image"}]}'
  ```
  El archivo se copia a `public/uploads/` y queda además en la biblioteca de inputs.
  (En `calcos[]` / `screens[]` se puede pasar `path` directo y se importa solo.)


### 4.6 🔗 PRESETS POR LINK — mandar UNA visualización al cliente

Cada template guardado tiene su **link público propio**: abre esa composición exacta en el visor 3D.

```
https://vps-4455523-x.dattaweb.com/jpstagedesign/output3d.html?preset=sincretismo-de-silicio
https://vps-4455523-x.dattaweb.com/jpstagedesign/output3d.html?preset=sincretismo-de-silicio&ui=0   ← sin paneles
```

- **MODO VISTA**: un link con `?preset=` **nunca escribe el servidor** (ni la escena viva ni el
  `localStorage`). El cliente puede girar la cámara, entrar a los teles y tocar todo sin pisar el diseño.
  El badge superior (nombre + `🔗 Copiar link` + `✏️ Editar`) lo deja claro; `✏️ Editar` recarga sin el
  modo vista si querés seguir trabajando sobre ese preset.
- **`&ui=0`** oculta panel admin, barra de usuario, toolbar y HUD → sólo el 3D para mostrar.
- En la pestaña 💾 Guardar, cada template del listado tiene el botón **🔗** que copia su link al portapapeles.
- **Publicación automática**: si estás trabajando en local (`localhost:6645`), al guardar se replica al
  **VPS** (el template + las imágenes de `/uploads/` que falten), así el link del cliente funciona al toque.
  El `💾 Guardar en Servidor` explícito también publica la escena viva.
- El endpoint de subida es `POST /api/uploads/:name` (body crudo) y existe para esa publicación
  local → VPS; el CORS ya acepta `http://localhost:6645`.
- **Tecla P en modo vista**: abre el panel admin igual (y la 2ª P vuelve al modo limpio), así se puede
  retocar un preset desde su propio link sin abandonar el modo vista.

Verificación: `npm run test:preset` (con `JPSTAGE_3D_URL` apuntando al link del preset y `--click-save`
comprueba que un click en Guardar **no** dispara ningún POST).


### 4.7 🎨 COLOR PLANO / SILUETA de un objeto 3D

Cualquier objeto 3D (`.obj` / `.glb`) se puede pintar de **un color plano**, ignorando sus texturas: sirve
para armar una **silueta** (p. ej. una persona blanca) con cualquier modelo.

- **UI**: seleccioná el objeto → panel derecho → sección **Objeto 3D** → fila **Color**:
  - 🎨 selector de color (se aplica en vivo mientras lo movés),
  - **🤍 Silueta** → lo pinta blanco puro de un click,
  - **↺ Modelo** → vuelve a los materiales originales del archivo.
- **Se guarda**: la config guarda `furniture[].color` (`'#rrggbb'` o `null`) — sobrevive al guardado,
  al recargar y viaja dentro de los templates/presets.
- El material del tinte es un `MeshStandardMaterial` (roughness 0.55, metalness 0), sin mapa de textura:
  por eso el color sale parejo y no "sucio" por la textura del modelo.

**Asset de referencia — `public/models/persona-blanca.glb`**: persona de 1.80 m en pose natural (brazos
abajo), 28 k vértices, horneada desde el modelo riggeado `Xbot` de three.js aplicando su **animación
`idle`** y congelándola a geometría estática (sin skin) con material blanco. Se usa en los presets
"Sincretismo" (escala 0.95 → 1.71 m) parada sobre la marca de piso.

- Herramienta de horneado: **`/jpstagedesign/models/_bake.html`** — carga un `.glb` con esqueleto, le
  aplica la animación en un tiempo `t`, convierte la malla deformada en geometría estática (misma cuenta
  de skinning que el shader de three) y la exporta como `.glb` blanco, subiéndola por
  `POST /api/uploads/:name`. Se usa con query string, p. ej.
  `?file=/jpstagedesign/models/xbot.glb&anim=idle&t=0&out=persona-blanca.glb`.
  (Se renderiza sin WebGL: sólo importa la matemática del horneado. ⚠️ Hay que conservar los **índices**
  de la geometría antes de `computeVertexNormals()`, si no el modelo queda con aspecto "astillado".)
- Visor rápido de un modelo a escala real (para revisar un asset antes de meterlo en la escena):
  **`/jpstagedesign/models/_one.html?file=/jpstagedesign/models/persona-blanca.glb`** (acepta varios
  separados por coma).
- Capturas headless de cualquier página: `node tests/_shot.js <url> <out.png> [waitMs] [WxH] [--ready=expr]`.

Verificación: `npm run test:tint` (Chrome headless: cambia el color y comprueba que el objeto se pinta en
el link de preset **sin escribir nada**, y que en la escena viva el color se guarda en el servidor y se
recupera al recargar).


### 4.8 🔑 LOGIN FSC (fscauth SSO)

La botonera se puede usar **logueado con la cuenta del ecosistema FullScreen Code** (login central
`fscauth`, el mismo que usan fullscreencode, MapAI, arte digital data, etc.). **No hay gating**: sin
sesión la app funciona igual y los links de preset siguen siendo públicos (el cliente no necesita cuenta).

- **UI**: arriba a la derecha de la cabecera (`#authWidget`), pintado por `public/js/auth.js`:
  sin sesión → **🔑 Ingresar** + **Registrarme**; con sesión → chip `● usuario` (+ badge `ADMIN`) + **Salir**.
- **Flujo** (idéntico al resto del ecosistema):
  - Ingresar → primero consulta `{FSCAUTH}/api/auth/verify` (con cookies): si ya hay sesión central entra
    directo por `sso-check`; si no, va a `{FSCAUTH}/login.html?redirect=<url>&origin=jpstagedesign`.
  - fscauth vuelve con `?token=&username=&userId=`; `auth.js` lo guarda en `localStorage.fsc_token` /
    `fsc_user`, limpia la URL y pinta el chip.
  - Salir → `{FSCAUTH}/api/auth/logout?redirect=<url>`.
- **Backend** (`server.js`): `GET /api/auth/me` (valida el Bearer contra `fscauth/api/auth/verify`),
  `POST /api/auth/login` y `POST /api/auth/register` (proxy). **No agrega `jsonwebtoken` ni copia
  `JWT_SECRET`**: delega la validación en fscauth (Node 22 tiene `fetch` global).
- `CONFIG.FSCAUTH_URL` ya existe en `public/js/config.js` (apunta al VPS).
- ⚠️ Los links de preset (`output3d.html?preset=…`) y la salida limpia (`output/`, `output.html`) **NO**
  cargan `auth.js`: nunca deben pedir login.

Verificación: `npm run test:auth` (`tests/cdp-auth-sso.js`) — sin sesión hay botón Ingresar; con el
handoff `?token=` se guarda la sesión, se limpia la URL y aparece el chip con el rol; Salir la borra;
Ingresar termina en `fscauth/login.html?...&origin=jpstagedesign`; y `/api/auth/me` da 401 sin token.

### 4.9 👤 PERFIL UNIFICADO (`profile.html`)

`/jpstagedesign/profile.html` muestra la **cuenta unificada del ecosistema** (la misma de cualquier
otra app FSC) y el **índice de apps** con tu nivel de acceso en cada una. No guarda una copia del
usuario: lee el registro central de fscauth.

- **Endpoint central** (agregado a fscauth el 27-Sep-2026): `GET /fscauth/api/auth/profile` con
  `Authorization: Bearer <JWT>` → `{ ok, user:{ id, username, email, displayName, avatar, bio, hexId,
  socials, role, origin, permissions, meta{lastLogin,loginCount}, createdAt } }`. Nunca devuelve
  `password` ni los campos de recuperación. Documentado en el MEGASKILL (§ 1.D).
- **Proxy de la app**: `GET /jpstagedesign/api/auth/profile` (`server.js`) valida el Bearer contra
  fscauth y, si el fscauth desplegado aún no expone el endpoint, degrada a `/api/auth/verify`.
- **UI**: cabecera con accesos rápidos + widget de sesión; con sesión muestra avatar (o iniciales),
  nombre/@usuario + `hexId`, badges de rol y permisos, bio, redes, email, miembro desde, último
  ingreso e ingresos. Sin sesión, un gate con **🔑 Ingresar** / **Registrarme** (no redirige solo).
- **Índice de apps** (17): jpshadereditor, artedigitaldata, pizzarraia, diploia, mapai, volumetric,
  raicesinterface, imagecampus, botonera, jpstagedesign, pinkcarpet, shiny, rose, jpupper,
  fullscreencode, jpnet y fscauth — cada una con el badge de tu nivel (`ADMIN GLOBAL` si el rol es
  ADMIN/SYSTEM, o el `permissions.*` de la app). Los links que no están publicados como carpeta en
  `fullscreencode.com` apuntan al VPS.
- **Chip del ecosistema**: en la botonera, el chip `● usuario` es un enlace a este perfil.
- **🔘 Botón FSC**: `public/index.html` carga `js/fsc-button.js` de fscauth (botón flotante con el logo
  FSC → pasaporte). Sin sesión lleva al login central; con sesión, al perfil.
- **🗂️ Índice universal de assets**: `GET /api/fsc/assets?username=<usuario>` expone los **escenarios
  guardados** (`data/templates/*.json`, con el link público `output3d.html?preset=<slug>`) para que el
  pasaporte de fscauth los muestre. Autorización: `x-fsc-internal` (clave interna del ecosistema, ya en
  el `.env` del VPS) o un Bearer FSC válido del propio usuario. Sin credenciales → **401**.

Verificación: `npm run test:profile` (`tests/cdp-profile.js`) — gate sin sesión, las 17 tarjetas con
href, el chip como enlace, `401 JSON` sin token / con token inválido, y el render completo con sesión
(mockeando sólo la red). En producción:
`JPSTAGE_BASE=https://vps-4455523-x.dattaweb.com/jpstagedesign npm run test:profile`.
