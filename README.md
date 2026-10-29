# ⚡ Flashcards Estudio Hub (SQLite)

Plataforma privada, moderna y de alto rendimiento para estudiar múltiples materias mediante flashcards, active recall, diagramas e imágenes, con base de datos **SQLite**.

---

## 🚀 Inicio Rápido

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar tu token privado en `.env`:
   ```bash
   # Copia el archivo de ejemplo si no tienes .env
   cp .env.example .env
   ```

3. Iniciar el servidor:
   ```bash
   npm start
   ```

4. Abrir en el navegador:
   ```text
   http://localhost:5000
   ```

---

## 🔐 Seguridad y Administración Privada

La interfaz web está diseñada para ser solo de lectura y estudio: **no expone botones públicos de subida ni formularios para que terceros agreguen datos a tu servidor**.

Para agregar o modificar materias:

- **Vía comando CLI local (recomendado):**
  ```bash
  npm run import -- ruta/a/tu_materia.json
  # o con base de datos SQLite:
  npm run import -- ruta/a/tu_materia.db
  ```

- **Vía API protegida con token:**
  Los endpoints `POST /api/subjects`, `DELETE /api/subjects/:id` y `POST /api/import-sqlite-raw` requieren el encabezado:
  ```http
  x-admin-token: tu_token_secreto_definido_en_env
  ```
  *(Cualquier petición sin el token recibirá `401 Unauthorized`)*.

---

## ✨ Características

- **🗄️ Base de Datos SQLite:** Todo guardado de forma limpia en `data/flashcards.db`.
- **🃏 Sesión de Estudio Activa:**
  - Giro 3D interactivo.
  - Opciones de mazo (10, 20, 50 o todas las tarjetas).
  - Modos: Aleatorio, En orden o Solo difíciles marcadas con estrella (⭐).
  - Filtro por tema/tag dentro de cada materia.
  - Alternador: *"Concepto primero"* o *"Definición primero"*.
- **🖼️ Diagramas e Imágenes:**
  - Soporte integrado para diagramas en frente o reverso.
  - Visor Lightbox a pantalla completa con un clic.
- **🔁 Repaso Inteligente de Errores:**
  - Botón para repasar inmediatamente solo las tarjetas que fallaste.
- **📖 Modo Explorador / Referencia:**
  - Búsqueda en tiempo real de todos los conceptos y definiciones.
- **🌙 Modo Oscuro / Claro:**
  - Conmutador integrado con detección del tema del sistema.
- **⌨️ Atajos de Teclado:**
  - `[Espacio]`: Girar la tarjeta.
  - `[←]` o `[1]`: Me equivoqué.
  - `[→]` o `[2]`: Acerté.
  - `[S]`: Marcar como difícil (⭐).
  - `[Esc]`: Cerrar visor de imagen / modales.

---

## 📚 Documentación

Para ver los detalles del esquema de base de datos y cómo vincular imágenes, consulta la guía [DATA_FORMAT.md](./DATA_FORMAT.md).
