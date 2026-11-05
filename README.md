# OptimaGuía · prototipo de RA

Prototipo web de realidad aumentada para la audioguía de la Basílica de San Juan de Dios, probado en la oficina de Óptima Cultura en Madrid. Hay dos versiones:

- **Vinilos** (`/`): reconoce tres vinilos de la oficina con MindAR y coloca encima al guía 3D animado. Funciona en Safari del iPhone. El guía solo se ve mientras el vinilo está en pantalla.
  https://homerojimenez.github.io/optimaguia-ra/
- **Seguimiento espacial** (`/xr/`): WebXR. El guía camina por el suelo de la sala y te sigue mientras andas. Al tocar un punto, se pone delante de ti, lo señala y te lo explica. Los vinilos sirven para colocar los puntos de cada zona, que se quedan fijos en la sala; si el móvil no reconoce imágenes, cada zona se coloca a mano con un toque en el suelo. En iPhone se abre en el App Clip Needle Go (ARKit); en Android, en Chrome.
  https://homerojimenez.github.io/optimaguia-ra/xr/
  Simulación en el ordenador: https://homerojimenez.github.io/optimaguia-ra/xr/?sim

## Voz y preguntas

La voz (ElevenLabs) y las respuestas en tiempo real (Claude) pasan por un servidor de Cloudflare (`../worker` en el proyecto). Las claves están guardadas allí como secretos; **no van en este repositorio**. La dirección del servidor está en `config.js`. Sin servidor, el guía usa la voz del móvil y respuestas preparadas.

Añade `?debug` a la dirección para ver el diagnóstico: fotogramas por segundo, suelo, capa DOM, reconocimiento de imágenes y estado del guía.

El contenido de la versión espacial (zonas, puntos y frases) está en `xr/contenido.js`.
