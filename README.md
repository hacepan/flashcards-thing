# Flashcards Estudio Hub

Plataforma web para el estudio y repaso de materias académicas mediante tarjetas de memoria (flashcards), active recall y diagramas técnicos, con almacenamiento en SQLite.

## Tabla de contenidos

- [Descripción general](#descripción-general)
- [Requisitos previos](#requisitos-previos)
- [Instalación y configuración](#instalación-y-configuración)
- [Ejecución](#ejecución)
- [Gestión y carga de datos](#gestión-y-carga-de-datos)
- [Características del sistema](#características-del-sistema)
- [Atajos de teclado](#atajos-de-teclado)
- [Documentación técnica](#documentación-técnica)

## Descripción general

El sistema proporciona un entorno de estudio enfocado en la retención activa y la navegación eficiente de conceptos. La aplicación cuenta con una interfaz web orientada exclusivamente a la lectura y práctica, manteniendo las operaciones de modificación y carga de datos aisladas bajo autenticación por token y herramientas de línea de comandos.

## Requisitos previos

- Node.js (versión 16 o superior)
- npm

## Instalación y configuración

1. Clonar el repositorio y acceder al directorio del proyecto:
   ```bash
   cd flashcards_estudio
   ```

2. Instalar las dependencias:
   ```bash
   npm install
   ```

3. Crear el archivo de variables de entorno a partir de la plantilla:
   ```bash
   cp .env.example .env
   ```

4. Definir las variables requeridas en `.env`:
   - `PORT`: Puerto de escucha del servidor HTTP (por defecto `5000`).
   - `ADMIN_TOKEN`: Clave secreta para autorizar operaciones de administración en la API.

## Ejecución

Para iniciar el servidor:

```bash
npm start
```

Una vez en ejecución, la interfaz está disponible en:

```text
http://localhost:5000
```

## Gestión y carga de datos

Por razones de seguridad, la interfaz pública no incluye formularios para la creación o alteración de materias. La carga y actualización de datos se realiza mediante dos vías:

### 1. Herramienta de línea de comandos (CLI)

Permite importar archivos JSON o bases de datos SQLite directamente en el entorno local:

```bash
# Importación desde archivo JSON
npm run import -- ruta/a/la_materia.json

# Importación desde base de datos SQLite
npm run import -- ruta/a/la_materia.db
```

### 2. API administrativa

Los endpoints de modificación requieren la cabecera HTTP `x-admin-token` con el valor asignado a `ADMIN_TOKEN`:

- `POST /api/subjects`: Creación o actualización de materias en formato JSON.
- `DELETE /api/subjects/:id`: Eliminación de una materia por identificador.
- `POST /api/import-sqlite-raw`: Carga binaria directa de un archivo SQLite.

Ejemplo de consulta autenticada:

```bash
curl -X DELETE http://localhost:5000/api/subjects/redes \
  -H "x-admin-token: tu_token_secreto_definido_en_env"
```

Cualquier petición sin la cabecera correspondiente responderá con código `401 Unauthorized`.

## Características del sistema

- **Persistencia local en SQLite:** Almacenamiento estructurado en `data/flashcards.db` sin dependencias externas adicionales.
- **Sesiones de estudio configurables:**
  - Opciones de mazo por volumen (10, 20, 50 tarjetas o selección completa).
  - Orden aleatorio o secuencial.
  - Filtro por temas y etiquetas.
  - Filtro exclusivo para tarjetas marcadas como difíciles.
  - Inversión de tarjeta (visualización de concepto primero o definición primero).
- **Soporte de diagramas e imágenes:**
  - Renderizado de imágenes en el anverso, reverso o ambos lados.
  - Visor ampliado (lightbox) en pantalla completa.
- **Flujo de repaso enfocado:**
  - Detección de respuestas erróneas y generación inmediata de sesiones de repaso para tarjetas falladas.
- **Explorador y referencia:**
  - Búsqueda instantánea de términos sobre el total de tarjetas de cada materia.
- **Tema visual:**
  - Selector de modo oscuro y modo claro con sincronización según las preferencias del sistema operativo.

## Atajos de teclado

| Tecla | Función |
| :--- | :--- |
| `Espacio` | Girar tarjeta |
| `Flecha izquierda` / `1` | Marcar como fallada |
| `Flecha derecha` / `2` | Marcar como acertada |
| `S` | Marcar o desmarcar como difícil |
| `Esc` | Cerrar visor de imagen y ventanas modales |

## Documentación técnica

Para especificaciones detalladas sobre el esquema relacional de SQLite y las pautas para vincular diagramas e imágenes, consulte [DATA_FORMAT.md](./DATA_FORMAT.md).
