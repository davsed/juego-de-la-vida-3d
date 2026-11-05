# Juego de la vida 3D

Versión en tres dimensiones del juego de la vida, en primera persona y con estética de bloques.

**Jugar:** https://davsed.github.io/juego-de-la-vida-3d/

## Cómo se juega

- **Partida libre**: elige reglas (Hervidero, Clásico en 3 planos, Clásica de Bays, Cristal, Lava o personalizada), cómo empieza (al azar, dibujándolo, un cubo o un planeador), el tamaño del recinto y el aspecto (qué indican los colores y el ambiente: día, atardecer o noche).
- **Retos**: 7 objetivos con estrellas (que algo sobreviva, que viaje, que se quede quieto, que haga bucle, que toque el techo, que llegue a 500 cubos…).
- **Dibujar**: pincel de 1, 9 o 27 cubos, espejo en 4 esquinas, figuras ya hechas (planeador, bloque, cruz, anillo, esfera, pirámide…) y deshacer.
- **Vistas**: volar, andar con gravedad sobre los cubos o cine (la cámara gira sola). Botón para ir al centro de la acción y corte para ver el interior.
- **Extras**: animación de nacer y morir, gráfica de población, sonido opcional, foto, fin de partida con récord.

## Controles

- **Ordenador:** WASD + ratón (clic para capturarlo, Esc para soltarlo), Ctrl correr, Espacio/Mayús subir/bajar (o saltar al andar). Dibujo: clic pone, clic derecho quita, Z deshacer. Atajos: P pausa, N paso, V velocidad, E dibujar, R reiniciar, M menú, G vista, T centro, C corte, B ambiente, F foto.
- **Móvil:** joystick (hasta el borde para correr), arrastrar para mirar, ▲ ▼ subir/bajar o saltar; en modo dibujo, toca el suelo o un cubo.

## Desarrollo

Página estática sin compilación: `index.html`, `css/`, `js/` y three.js desde un CDN. Las reglas y figuras están en `js/life.js` (con tests: `npm test`) y se calculan en segundo plano en `js/worker.js`. Al publicar cambios, sube el número `?v=` de los enlaces para que los navegadores no mezclen versiones.
