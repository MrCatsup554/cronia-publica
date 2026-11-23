# Cronia

Convierte tu carga académica en un horario semanal claro, listo para imprimir o
compartir. Importa un PDF o una foto del horario, corrige lo que haga falta y
expórtalo como PNG, JPG o PDF, o sincronízalo con Google Calendar.

## Qué hay dentro

El proyecto es un monorepo con npm workspaces y tres piezas:

```
packages/core     Dominio compartido: parser, temas y render. Sin DOM ni disco.
apps/web          Interfaz: React 19 + TypeScript + Vite + Zustand.
apps/server       API de OCR y sincronización con Google Calendar.
legacy/           El archivo .html original, conservado como referencia.
```

La idea que sostiene la arquitectura es que **el parser no sabe de dónde viene
el texto**. Tanto `pdf.js` (en el navegador) como Tesseract (en el servidor)
producen palabras con una caja delimitadora, así que ambos alimentan el mismo
motor de interpretación por coordenadas que vive en `@cronia/core`.

```
PDF con texto ──► pdf.js ─────┐
                              ├──► PositionedItem[] ──► parseSchedule ──► Course[]
Imagen o escaneo ──► Tesseract┘
```

## Poner en marcha

Hace falta Node 20.11 o posterior.

```bash
npm install
```

```bash
npm run dev
```

Eso levanta el frontend en <http://localhost:5173> y el servidor de OCR en
<http://localhost:8787>. Vite redirige `/api` al servidor, así que el navegador
siempre habla con un único origen y no hace falta configurar CORS.

La primera vez que se usa el OCR, Tesseract descarga el modelo de español
(unos 15 MB) y lo guarda en `.cache/tesseract`. A partir de ahí funciona sin
conexión.

### Sólo el frontend

El frontend funciona sin servidor: los PDF con texto seleccionable se leen
enteros en el navegador. Si el servidor no responde, la app lo detecta y avisa
de que la lectura de imágenes no está disponible, en vez de fallar a media
importación.

```bash
npm run dev:web
```

## Fondo de pantalla

Además de la hoja para imprimir o compartir, Cronia exporta el horario como
fondo de pantalla de teléfono. La cuadrícula se centra en la franja que dejan
libre el reloj, los widgets y los botones de linterna y cámara, de modo que
nada quede tapado en la pantalla de bloqueo.

En ese modo no se dibujan ni el título, ni la lista de materias, ni el pie: la
franja utilizable es estrecha y todo eso le robaría sitio a lo único que
interesa ver de un vistazo. Los rangos de hora se abrevian («8–10» en lugar de
«08:00–10:00») porque a lo ancho de un teléfono no cabe la forma larga.

| Formato  | Proporción | Imagen      |
| -------- | ---------- | ----------- |
| iPhone   | 19.5:9     | 1290 × 2796 |
| Android  | 20:9       | 1440 × 3200 |
| Clásico  | 16:9       | 1440 × 2560 |

La vista previa sombrea las dos franjas reservadas para que se vea dónde caen;
esas marcas nunca forman parte del archivo exportado. Si el horario no cabe en
la franja central, la aplicación lo avisa y sugiere recortar el rango de horas
desde la pestaña Diseño.

## Comprobaciones

```bash
npm run typecheck && npm run lint && npm test
```

Las pruebas de OCR real están desactivadas por defecto, porque tardan unos
segundos y la primera vez necesitan descargar el modelo de idioma:

```bash
RUN_OCR_TESTS=1 npm test
```

## Compilar para producción

```bash
npm run build
```

El servidor puede servir también el frontend ya compilado. Basta apuntarle a la
carpeta de salida:

```bash
STATIC_DIR=../web/dist npm start
```

## Configuración

El servidor carga el archivo `.env` de la raíz del proyecto; las variables del
entorno tienen prioridad. `.env.example` sirve de plantilla.

| Variable           | Por defecto             | Para qué sirve                                    |
| ------------------ | ----------------------- | ------------------------------------------------- |
| `PORT`             | `8787`                  | Puerto del servidor                               |
| `CORS_ORIGIN`      | `http://localhost:5173` | Orígenes permitidos, separados por comas           |
| `OCR_LANGS`        | `spa+eng`               | Idiomas de Tesseract, separados por `+`            |
| `OCR_CACHE_DIR`    | `.cache/tesseract`      | Dónde se guardan los modelos de idioma             |
| `MAX_UPLOAD_BYTES` | `10485760`              | Tamaño máximo por archivo                          |
| `MAX_FILES`        | `4`                     | Imágenes por petición                              |
| `RATE_LIMIT_MAX`   | `20`                    | Peticiones por ventana y por IP                    |
| `STATIC_DIR`       | —                       | Carpeta del frontend compilado, si se quiere servir |

En el frontend, `VITE_API_URL` apunta a un servidor en otro origen. Si se deja
vacío, se usa el mismo origen.

## API

| Método | Ruta                 | Qué hace                                                        |
| ------ | -------------------- | --------------------------------------------------------------- |
| `GET`  | `/api/health`        | Estado del servicio, idiomas cargados y límites vigentes         |
| `POST` | `/api/ocr/schedule`  | Recibe imágenes (`multipart/form-data`) y devuelve las materias  |
| `POST` | `/api/parse/pages`   | Interpreta texto ya posicionado, sin pasar por OCR               |

Los errores llegan siempre con la misma forma, con un código estable y un
mensaje en español listo para mostrar:

```json
{
  "error": {
    "code": "sin_resultados",
    "message": "No se reconocieron clases con días y horas en la imagen.",
    "hint": "Se encontró la tabla, pero no se leyeron los horarios."
  }
}
```

## Privacidad

Los PDF con texto se leen en el navegador y los archivos exportados se generan
ahí. Las imágenes que mandes al OCR se procesan en el servidor de Cronia.

Google Calendar es opcional. Al activarlo, Cronia envía el horario a su servidor
y después a Google. Las credenciales de Google, la cuenta conectada y la copia
pendiente del horario se guardan cifradas con AES-256-GCM en el servidor; no se
guardan tokens de Google en el navegador. La sesión usa una cookie HttpOnly.
Al desconectar se revoca la autorización y se elimina del servidor la copia del
horario pendiente y sus credenciales. Se conservan los identificadores de los
eventos para evitar duplicados al reconectar, y las clases permanecen en Google.

## Limitaciones conocidas del OCR

El reconocimiento depende de la calidad de la imagen. Dos casos concretos que
conviene tener presentes:

- **Líneas de tabla pegadas al texto.** Tesseract puede absorber una regla
  horizontal dentro de la caja de la primera palabra de la fila. Cronia descarta
  las cajas absurdamente anchas para que no arrastren la detección de columnas,
  pero esa palabra se pierde. Escanear a más resolución lo evita.
- **Columnas muy juntas.** Si la columna de docente queda pegada a la del
  último día, su texto puede acabar asignado a ese día.

Cuando el reconocimiento va justo de confianza, la app lo dice y recomienda
revisar los datos en la pestaña Materias antes de exportar.

## Licencia

MIT.

## Exportar a Google Calendar

En **Exportar → Google Calendar**, indica las fechas de inicio y fin del ciclo y
confirma la zona horaria de las clases. Descarga el archivo `.ics` y, desde una
computadora, abre Google Calendar → Configuración → Importar y exportar. Selecciona
el archivo y el calendario de destino y pulsa Importar.

Cada sesión se repite semanalmente hasta el fin del ciclo e incluye materia,
docente, clave, edificio y salón. Se exportan todas las clases, aunque el diseño
oculte algún día u hora. Los días festivos deben quitarse en Google Calendar.
La exportación es una copia puntual; no sincroniza cambios posteriores.

[Instrucciones de importación de Google](https://support.google.com/calendar/answer/37118?hl=es).


## Conectar y sincronizar Google Calendar

1. En Google Cloud, crea o selecciona un proyecto y habilita **Google Calendar API**.
2. Configura la pantalla de consentimiento OAuth. En modo de prueba agrega tu
   cuenta a los usuarios de prueba. Para usuarios externos en producción revisa
   los requisitos de publicación y verificación que indique Google Cloud.
3. Crea un cliente OAuth de tipo **Aplicación web**. Agrega el URI autorizado
   `http://localhost:5173/api/google/callback` para desarrollo. En producción usa
   `https://tu-dominio/api/google/callback`.
4. Guarda `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en el `.env` de la raíz.
   Genera la clave de cifrado y guarda el resultado como `GOOGLE_TOKEN_KEY`:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

5. Define `GOOGLE_APP_ORIGIN` con el origen público del frontend, sin barra final.
   Mantén `/api/google` en ese mismo origen mediante Vite o tu proxy de producción.
   `VITE_API_URL` sólo configura OCR; no cambia la conexión de Google.
6. Define `GOOGLE_DATA_DIR` en un volumen persistente privado (preferiblemente una
   ruta absoluta), conserva la clave de cifrado fuera de ese volumen y reinicia
   el servidor. No cambies la clave sin migrar los datos cifrados existentes.
7. En **Exportar → Google Calendar**, pulsa **Conectar con Google**, concede los
   permisos, revisa las fechas y activa la sincronización automática.

Se solicita identidad y correo, permiso `calendar.app.created` para administrar
el calendario creado por Cronia y `calendar.calendarlist.readonly` para recuperar
ese calendario después de una respuesta de creación perdida. No se solicitan
permisos de edición sobre todos los calendarios personales. El acceso a Google
usa OAuth con estado de un solo uso y PKCE; las operaciones del navegador requieren
un token CSRF y el origen configurado. Los códigos OAuth no se escriben en logs.

La sincronización es **Cronia → Google**, con una serie semanal por sesión.
Mantiene los IDs al editar y elimina únicamente eventos registrados por Cronia
cuando se quitan clases del horario. Los cambios de diseño o color no generan
actualizaciones. Las ediciones hechas en Google no se importan a Cronia. Festivos
y vacaciones dentro del ciclo no se excluyen automáticamente.

El navegador envía los cambios tras una pausa de edición. El servidor guarda el
último horario aceptado y reintenta errores temporales con espera creciente, incluso
si se cierra la página. Los cambios aún no enviados requieren volver a abrir Cronia.
Pausar cancela los envíos pendientes; desconectar también revoca la autorización.
La página muestra la cuenta, el estado y la última sincronización confirmada.

Se detectan revisiones de otra pestaña o dispositivo y se pausa el envío local
para evitar sobrescribir silenciosamente su horario. **Reanudar** envía la versión
local después de revisarla. Hay un calendario de Cronia por cuenta de Google en
esta instalación. El calendario y sus IDs se reutilizan al reconectar.

### Operación y límites

- Esta implementación usa archivos cifrados y exclusión mutua en memoria: ejecuta
  **un solo proceso servidor** con ese directorio. Para varias réplicas, sustituye
  el almacenamiento y la cola por una base de datos y bloqueo distribuido.
- La sesión del navegador dura 30 días. Si vence o se revoca la autorización,
  vuelve a conectar. Google puede hacer vencer las autorizaciones de aplicaciones
  en modo de prueba; no es un error de Cronia.
- Si Google no confirma una creación y no aparece el calendario al consultarlo,
  Cronia se detiene antes de crear duplicados. Un administrador debe verificar en
  Google el resultado antes de recuperar o restablecer esa conexión.
- No borres el directorio persistente para corregir un error: contiene la relación
  entre cuentas y eventos. Perderlo puede generar calendarios nuevos al reconectar.
- HTTPS es obligatorio fuera de localhost. La clave de cifrado y el secreto OAuth
  sólo pertenecen al servidor y nunca deben usar el prefijo `VITE_`.
- Las pruebas automáticas usan un proveedor simulado. La prueba final de consentimiento
  y sincronización real requiere las credenciales del proyecto y una cuenta de prueba.

Referencias: [OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server),
[permisos de Calendar](https://developers.google.com/workspace/calendar/api/auth).


## Descargar Excel y calendarios compatibles

En **Exportar → Excel**, descarga un `.xlsx` editable con las hojas **Horario semanal**
y **Clases**. Incluye todas las materias y sesiones, también los fines de semana y
las materias sin sesiones. La lista permite filtrar por día o materia y calcula la
duración de cada clase. No requiere fechas ni cuenta de Google. Las dos hojas son
copias independientes; editar una no actualiza la otra ni modifica Cronia.

En **Exportar → Calendario (.ics)**, elige las fechas del ciclo y la zona horaria.
El archivo se puede importar en Google Calendar, Outlook en la web y Calendario de
Apple en Mac, además de otras aplicaciones compatibles con iCalendar. La sección
**Cómo importar el archivo** incluye pasos y enlaces de ayuda para cada aplicación.
Esta descarga funciona sin conectar Google y no sincroniza cambios posteriores.

## Chatbot, CRM y ERP

- **Ayuda de Crónia** responde preguntas frecuentes en español y abre la pestaña
  correspondiente del editor. Las respuestas se generan en el navegador mediante
  reglas, sin servicios de IA ni cuotas por conversación.
- **CRM** recibe las consultas del chatbot con folio, nombre y correo. El equipo
  puede registrar contactos, buscar por folio, anotar el seguimiento y marcar
  cada consulta como nueva, en seguimiento o resuelta.
- **ERP** administra un inventario de recursos con código y mínimo de existencias.
  Registra entradas y salidas en un historial y evita salidas que dejen saldo
  negativo.

El enlace **Gestión del equipo** abre `/gestion`. Define una clave aleatoria
`MANAGEMENT_PASSWORD` en el entorno del servidor y úsala para entrar. Puedes
generarla con Node, pegarla como valor de la variable y guardar la clave en tu
gestor de contraseñas.

```bash
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

En desarrollo, si no hay Redis configurado, los registros se guardan en
`.data/management`. En Render, define también `UPSTASH_REDIS_REST_URL` y
`UPSTASH_REDIS_REST_TOKEN` para que los datos sobrevivan a los despliegues.
Puedes reutilizar el Redis que usa Google Calendar. El CRM y el ERP guardan
sus datos con claves propias. Los módulos pueden operar con el plan gratuito
de Redis dentro de su cuota. El formulario de consultas y el panel se habilitan
cuando la configuración de gestión está presente.

## Demostración pública

[Abre Crónia en GitHub Pages](https://mrcatsup554.github.io/cronia-publica/).

La demostración permite probar el editor, el chatbot, el envío de consultas al
CRM y los movimientos del ERP. Desde **Gestión del equipo**, selecciona
**Entrar a la demostración**. Usa datos ficticios. Las consultas y los
movimientos se guardan en el navegador que los registra.

Para contar con registros compartidos, autenticación de gestión, OCR y
sincronización con Google Calendar, ejecuta la aplicación completa con el
servidor de Node.js. Las instrucciones están en las secciones anteriores.

Para compilar la demostración:

```bash
npm ci
npm run build --workspace @cronia/core
npm run build --workspace @cronia/web -- --mode pages --base /cronia-publica/
mkdir -p apps/web/dist/gestion
cp apps/web/dist/index.html apps/web/dist/gestion/index.html
```
