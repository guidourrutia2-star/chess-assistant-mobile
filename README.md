# Chess Assistant

Extensión de Chrome Manifest V3 para editar posiciones y consultar automáticamente a Stockfish. El motor se ejecuta localmente; la extensión no tiene permisos de red y no mueve piezas.

## Instalar en Chrome

1. Descargá y descomprimí `Chess-Assistant.zip` en una carpeta permanente.
2. Abrí `chrome://extensions` en Chrome 114 o posterior.
3. Activá **Modo de desarrollador**.
4. Elegí **Cargar descomprimida** y seleccioná la carpeta que contiene `manifest.json`.
5. Abrí Chess Assistant desde el ícono de extensiones. Se mostrará en el panel lateral de Chrome.

El panel lateral permanece abierto al hacer clic en la página. Para abrirlo de nuevo, hacé clic en el ícono de Chess Assistant.

## Usarla en un teléfono

Chrome para Android y iPhone no instala extensiones de escritorio. El proyecto incluye la misma interfaz como PWA instalable:

1. Publicá el contenido de esta carpeta en un sitio HTTPS estático. No hace falta un servidor de ajedrez; los archivos de Stockfish ya están incluidos.
2. Abrí la dirección HTTPS desde el teléfono y esperá a que cargue. La primera vez se necesita conexión para descargar la app y el motor completo (cerca de 100 MB).
3. En Android, usá **Instalar app** o **Agregar a pantalla principal** en el menú de Chrome. En iPhone, abrí la página en Safari, tocá **Compartir** y elegí **Agregar a pantalla de inicio**.
4. Después abrí Chess Assistant desde el ícono que quedó en la pantalla de inicio. La PWA guarda los archivos para intentar funcionar sin conexión.

En teléfono se mantiene el tablero manual, el historial, el ajuste de Elo y Stockfish local. La velocidad del modo de máxima fuerza depende del procesador y la memoria del dispositivo.

## Uso

- Elegí **Ver desde Blancas** o **Ver desde Negras** para girar el tablero; es independiente del turno.
- **Juegan** indica quién mueve. Solo se recomienda una jugada para ese bando. Al mover la pieza, el turno pasa al otro color y el análisis se actualiza.
- Ajustá **Fuerza de Stockfish** entre 1320 y 3190 Elo. **Máxima fuerza** quita el límite de Elo y mantiene el análisis buscando jugadas más profundas; la mejor variante visible se actualiza mientras piensa.
- Hacé clic en una pieza del turno actual y después en uno de los destinos marcados en verde. La pieza elegida queda resaltada; la recomendación de Stockfish también resalta el origen y el destino.
- Elegí una pieza de la paleta y tocá una casilla para colocarla. Volvé a tocar la misma pieza en la paleta para salir del modo de colocación.
- Usá **Quitar piezas**, clic derecho sobre una casilla o **Vaciar tablero** para borrar piezas.
- La barra mide profundidad y estabilidad de la recomendación. Un 100% significa que la misma jugada se mantuvo durante seis niveles y se alcanzó la profundidad configurada; no garantiza certeza matemática.
- Ingresá manualmente cada jugada en el tablero de la extensión. El historial y las recomendaciones se actualizan a partir de esos movimientos; la extensión no lee ni controla la página donde jugás.
- Las recomendaciones nunca aplican una jugada.

Las posiciones de análisis necesitan exactamente un rey de cada color y no pueden tener peones en la primera ni en la última fila. Las posiciones armadas a mano no incluyen historial de enroque ni de captura al paso.

## Archivos de terceros y licencias

- `vendor/stockfish/`: Stockfish.js 19 Single completo, WebAssembly, bajo GPL-3.0. Ver `vendor/stockfish/COPYING.txt`.
- `vendor/chessjs/`: chess.js 1.4.0, MIT. Ver `vendor/chessjs/LICENSE`.
- `manifest.webmanifest`, `pwa-sw.js` y `assets/`: versión instalable para teléfono.

El motor completo ocupa cerca de 100 MB. Está incluido en el ZIP y no se descarga desde una CDN al abrir la extensión. La fuerza máxima puede usar más CPU y actualizar la recomendación gradualmente mientras analiza.
