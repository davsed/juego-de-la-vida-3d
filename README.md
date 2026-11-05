# Juego de la vida 3D

Versión en tres dimensiones del juego de la vida, en primera persona y con estética de bloques.

**Jugar:** https://davsed.github.io/juego-de-la-vida-3d/

## Reglas

Cada cubo mira a sus 26 vecinas (las que lo rodean en el espacio):

- **Sobrevive** con 5, 6 o 7 vecinas vivas.
- **Nace** donde hay exactamente 5 vecinas vivas.
- **Muere** en cualquier otro caso.

Las células solo nacen dentro de la zona de vida (41 × 41 de planta y 30 de alto), marcada con líneas blancas; el suelo es infinito. También se puede elegir la regla clásica de Carter Bays (4-5 / 5).

## Controles

- **Ordenador:** WASD para andar, ratón para mirar (clic en la escena), Espacio/Mayús para subir/bajar, P pausa, N un paso, V velocidad, R reiniciar, M menú.
- **Móvil:** joystick abajo a la izquierda para andar, arrastrar el dedo para mirar, botones ▲ ▼ para subir/bajar.

## Desarrollo

Página estática sin compilación: `index.html`, `css/`, `js/` y three.js desde un CDN. La lógica de las reglas está en `js/life.js` y se prueba con:

```
npm test
```
