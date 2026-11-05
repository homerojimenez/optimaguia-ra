// Dirección del servidor de Cloudflare (prototipo-ra/worker) que guarda las claves de Claude y ElevenLabs.
// Aquí no van claves: esta web es pública. Si se deja vacío, el guía usa la voz del móvil y respuestas preparadas.
// Para probar otro servidor sin tocar esto: añade ?api=https://… a la dirección de la página.
export const API_URL = 'https://optimaguia-ra.optimaguia.workers.dev';
