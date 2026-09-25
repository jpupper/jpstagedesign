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
