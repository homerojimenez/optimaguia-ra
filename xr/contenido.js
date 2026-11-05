// Contenido de la visita con seguimiento espacial.
// Cada zona cuelga de un vinilo. Posiciones de los puntos en metros, mirando al vinilo:
//   x = a la derecha del centro del vinilo, y = altura sobre el suelo, z = distancia desde la pared hacia ti.
// Son las mismas medidas que la versión de vinilos (sacadas del mapeo y de las medidas de Homero).
export const ZONES = [
  {
    id: 'bienvenida', title: 'Bienvenida', sub: 'Rincón del sofá',
    vinyl: { label: 'more soul', where: 'junto al sofá', img: '../assets/vinilos/more-soul.jpg', target: '../assets/targets/more-soul.jpg', widthM: 1.357, centerM: 1.63 },
    intro: 'Esta es la zona de bienvenida. Toca los puntos que ves y te los explico.',
    beacons: [
      { id: 'lema1', name: 'El lema', atVinyl: true, x: 0, y: 1.63, z: 0, photo: '../assets/vinilos/more-soul.jpg', over: 'Bienvenida',
        text: '«More soul, more beauty, more culture»: el lema de Óptima Cultura.',
        say: 'Este es el lema de la casa: más alma, más belleza, más cultura.' },
      { id: 'sofa', name: 'El sofá', x: 2.0, y: 0.6, z: -0.4, photo: '../assets/fotos/sofa.jpg', over: 'Rincón del sofá',
        text: 'El rincón del sofá, junto a la pared de pizarra y la alfombra naranja. Un buen sitio para esperar.',
        say: 'Este es el rincón del sofá, junto a la pared de pizarra y la alfombra naranja. Un buen sitio para esperar.' },
    ],
  },
  {
    id: 'planta', title: 'La planta', sub: 'Sala de reuniones',
    vinyl: { label: 'meetings that matter', where: 'en la sala de reuniones', img: '../assets/vinilos/meetings.jpg', target: '../assets/targets/meetings.jpg', widthM: 2.149, centerM: 1.69 },
    intro: 'Ya estás en la sala de reuniones. Toca la planta o el vinilo y te lo cuento.',
    beacons: [
      { id: 'lema2', name: 'El vinilo', atVinyl: true, x: 0, y: 1.69, z: 0, photo: '../assets/vinilos/meetings.jpg', over: 'Sala de reuniones',
        text: '«Meetings that matter… or maybe this could’ve just been an email».',
        say: 'Fíjate en la pared: reuniones que importen… o que podrían haber sido un correo.' },
      { id: 'planta', name: 'La planta', x: -1.3, y: 0.9, z: 2.3, photo: '../assets/fotos/planta.jpg', over: 'Sala de reuniones',
        text: 'Es una planta muy bonita.',
        say: 'Mira esta planta. Es una planta muy bonita; fíjate en sus hojas.' },
    ],
  },
  {
    id: 'cafe', title: 'El café', sub: 'Zona de la cafetera',
    vinyl: { label: 'not cultured yet?', where: 'en la zona del café', img: '../assets/vinilos/cultured.jpg', target: '../assets/targets/cultured.jpg', widthM: 1.881, centerM: 1.52 },
    intro: 'Esta es la zona del café. Toca la cafetera y te la presento.',
    beacons: [
      { id: 'lema3', name: 'La pregunta', atVinyl: true, x: 0, y: 1.52, z: 0, photo: '../assets/vinilos/cultured.jpg', over: 'Zona del café',
        text: '«Not cultured yet?»: ¿todavía sin cultura?',
        say: 'Y en la pared, una pregunta: ¿todavía sin cultura?' },
      { id: 'cafetera', name: 'La cafetera', x: 1.5, y: 1.2, z: 0.35, photo: '../assets/fotos/cafetera.jpg', over: 'Zona del café',
        text: 'Hace un café muy rico.',
        say: 'Esta es la cafetera. Hace un café muy rico.' },
    ],
  },
];

export const INTRO = [
  'Hola, soy tu guía. Hoy te acompaño por la oficina de Óptima Cultura.',
  'Apunta con el móvil a un vinilo de la pared y aparecerán los puntos de esa zona. Toca uno y voy a explicártelo.',
];
export const OUTRO = 'Ya has visto todos los puntos. Gracias por probar la visita; puedes preguntarme lo que quieras.';

export const QA = [
  { k: ['quien eres', 'como te llamas', 'eres tu'], a: 'Soy el guía de OptimaGuía. En la basílica de San Juan de Dios te contaré su historia. Hoy estamos de prueba en la oficina.' },
  { k: ['planta', 'hojas', 'verde'], a: 'Es una planta muy bonita. Está en la sala de reuniones, junto al vinilo «meetings that matter».' },
  { k: ['cafe', 'cafetera'], a: 'La cafetera está en la zona del café, junto al vinilo «not cultured yet?». Hace un café muy rico.' },
  { k: ['sofa', 'sentar', 'descansar'], a: 'El sofá está en el rincón de la pared de pizarra, junto al vinilo «more soul».' },
  { k: ['optima', 'oficina', 'empresa', 'lema'], a: 'Estás en la oficina de Óptima Cultura en Madrid. Su lema está en la pared: más alma, más belleza, más cultura.' },
  { k: ['basilica', 'granada', 'san juan'], a: 'La basílica de San Juan de Dios está en Granada. Esta prueba es para su audioguía.' },
];
export const SUGG = ['¿Quién eres?', '¿Qué tiene de especial la planta?', '¿Dónde está el café?', '¿Adónde voy ahora?'];
export const FALLBACK = 'Eso todavía no lo sé. En la visita real responderé con la información del monumento.';
