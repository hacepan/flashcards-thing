# 🗄️ Guía de Administración Privada y Base de Datos SQLite

El proyecto utiliza **SQLite** (`data/flashcards.db`) para almacenar materias y tarjetas de estudio de forma segura, privada y sostenible.

La interfaz web pública **no permite que terceros suban ni alteren contenidos**. Toda mutación a la base de datos está protegida por un **Token de Administrador** privado o mediante el script CLI de administración local.

---

## 🔐 Configuración de Seguridad (`ADMIN_TOKEN`)

El archivo `.env` en la raíz del proyecto define tu token secreto:
```env
ADMIN_TOKEN=flashcards_admin_secret_token
PORT=5000
```
> [!IMPORTANT]
> El archivo `.env` está en `.gitignore` para no ser compartido públicamente. Puedes cambiar el valor de `ADMIN_TOKEN` por cualquier clave secreta que desees.

---

## 🛠️ Cómo Agregar o Actualizar Materias (Métodos Privados)

Tienes dos métodos privados y seguros para poblar o actualizar tus materias:

### Método 1: Comando CLI Local (Recomendado)
Puedes importar archivos `.json` o bases de datos `.db` / `.sqlite` directamente desde tu terminal sin necesidad de abrir puertos ni exponer formularios:

```bash
# Para importar un archivo JSON:
npm run import -- data/subjects/mi_materia.json

# Para importar un archivo SQLite .db:
npm run import -- data/subjects/mi_materia.db
```

El script valida las tablas, inserta los registros y actualiza la base de datos `data/flashcards.db` al instante.

---

### Método 2: Endpoint Privado con Token de Autenticación
Los endpoints de escritura requieren el encabezado `x-admin-token` o `Authorization: Bearer <token>`:

#### 1. Crear / Actualizar materia con JSON:
```bash
curl -X POST http://localhost:5000/api/subjects \
  -H "Content-Type: application/json" \
  -H "x-admin-token: flashcards_admin_secret_token" \
  -d '{
    "id": "redes",
    "title": "Redes de Computadoras",
    "category": "Comunicaciones",
    "cards": [
      {
        "concept": "Topología en Estrella",
        "definition": "Todos los nodos están conectados a un concentrador central.",
        "tags": ["Topologías"],
        "image": "images/mi_diagrama.svg"
      }
    ]
  }'
```

#### 2. Subir base de datos SQLite (.db):
```bash
curl -X POST http://localhost:5000/api/import-sqlite-raw \
  -H "Content-Type: application/octet-stream" \
  -H "x-admin-token: flashcards_admin_secret_token" \
  --data-binary @ruta/a/tu_materia.db
```

#### 3. Eliminar una materia:
```bash
curl -X DELETE http://localhost:5000/api/subjects/redes \
  -H "x-admin-token: flashcards_admin_secret_token"
```

> [!NOTE]
> Cualquier solicitud a estos endpoints sin el token correcto recibirá un error `401 Unauthorized`.

---

## 🏗️ Esquema de Tablas SQLite (`data/flashcards.db`)

### Tabla `subjects`
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `TEXT PRIMARY KEY` | Slug único (ej: `'tgs'`, `'algoritmos'`) |
| `title` | `TEXT NOT NULL` | Título de la materia |
| `category` | `TEXT` | Categoría (ej: `'Ingeniería'`, `'Programación'`) |
| `description`| `TEXT` | Resumen de los contenidos |
| `icon` | `TEXT` | Icono o emoji (ej: `'🧠'`, `'⚡'`) |
| `color` | `TEXT` | Color hexadecimal de acento |

### Tabla `cards`
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `INTEGER PRIMARY KEY` | Autoincremental |
| `subject_id`| `TEXT NOT NULL` | Clave foránea referenciando `subjects(id)` |
| `concept` | `TEXT NOT NULL` | Pregunta / Concepto (Frente) |
| `definition`| `TEXT NOT NULL` | Respuesta / Definición (Reverso) |
| `tags` | `TEXT` | JSON array de tags (ej: `'["Unidad 1", "Leyes"]'`) |
| `image` | `TEXT` | Ruta relativa (`"images/diagrama.svg"`) o URL HTTPS |
| `image_position`| `TEXT` | `"back"`, `"front"` o `"both"` |
| `hint` | `TEXT` | Pista opcional para el botón 💡 |
| `is_starred`| `INTEGER` | 1 si está marcada como difícil, 0 si no |

---

## 🖼️ Imágenes y Diagramas
Guarda tus imágenes en [`data/images/`](file:///home/santi/Documents/code/flashcards_estudio/data/images) y referéncialas en tus tarjetas con `"images/nombre_archivo.svg"`. Al hacer clic sobre cualquier imagen en la tarjeta se abrirá el visor Lightbox en pantalla completa.
