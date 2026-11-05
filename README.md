# Juego de la vida 3D

Versión en tres dimensiones del juego de la vida, en primera persona y con estética de bloques.

**Jugar:** https://davsed.github.io/juego-de-la-vida-3d/

## Cómo se juega

1. **Elige las reglas**: Hervidero, Clásico en 3 planos, Clásica de Bays, Cristal, Lava o una personalizada (marcas con cuántas vecinas se sobrevive y se nace).
2. **Elige cómo empieza**: al azar, dibujándolo tú o con un solo cubo.
3. **Elige el tamaño del recinto** (41, 81 o 121 bloques de lado) y **qué indican los colores** (futuro, edad, vecinas o altura; siempre con leyenda).

Durante la partida: pausa, paso a paso, velocidad (1× a 8×), dibujar (poner y quitar cubos), reiniciar (vuelve a tu dibujo inicial) y menú. Si todo muere o se queda quieto, aparece el resultado y se guarda tu récord de generaciones para esas reglas.

## Controles

- **Ordenador:** WASD andar, ratón mirar (clic en la escena), Espacio/Mayús subir/bajar, E dibujar (clic izquierdo pone, derecho quita), P pausa, N paso, V velocidad, R reiniciar, M menú.
- **Móvil:** joystick para andar, arrastrar para mirar, ▲ ▼ subir/bajar; en modo dibujo, toca el suelo o un cubo.

## Desarrollo

Página estática sin compilación: `index.html`, `css/`, `js/` y three.js desde un CDN. Las reglas están en `js/life.js` (con tests: `npm test`) y se calculan en segundo plano en `js/worker.js`.
