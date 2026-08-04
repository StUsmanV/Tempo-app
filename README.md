# Tempo — El ritmo de tu enseñanza

Prototipo de app de gestión para profesores particulares, conectado a Supabase
(base de datos real, con inicio de sesión para profesores y estudiantes).

## Antes de publicar: un ajuste recomendado en Supabase

Por defecto, Supabase pide confirmar el correo antes de poder iniciar sesión.
Para que tus profes y estudiantes de prueba puedan entrar de una vez sin
revisar su correo:

1. Ve a tu proyecto en supabase.com → **Authentication** → **Providers** → **Email**.
2. Desactiva la opción **"Confirm email"**.
3. Guarda los cambios.

(Cuando pases esto a producción de verdad, puedes volver a activarlo.)

## Publicar la app (sin usar la terminal)

### Paso 1 — Sube el código a GitHub

1. Crea una cuenta gratis en [github.com](https://github.com) (puede ser con
   tu correo, es independiente de tu cuenta de Supabase).
2. Click en **"New repository"**. Ponle de nombre `tempo-app`. Déjalo
   **público o privado**, como prefieras. Click en **"Create repository"**.
3. En la página del repositorio recién creado, busca el link
   **"uploading an existing file"**.
4. Arrastra **todos los archivos y carpetas** de este proyecto ahí
   (excepto `node_modules` si llegara a aparecer — no debería, no lo incluimos).
5. Click en **"Commit changes"**.

### Paso 2 — Conecta con Vercel

1. Crea una cuenta gratis en [vercel.com](https://vercel.com) — elige
   **"Continue with GitHub"** para conectarlas directamente.
2. Click en **"Add New..." → "Project"**.
3. Selecciona el repositorio `tempo-app` que acabas de subir → **"Import"**.
4. Antes de darle a "Deploy", abre la sección **"Environment Variables"** y
   agrega estas dos (los valores están en tu archivo `.env.example`):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://yyryyymhhpmvmeztnaqx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_UY70jdHo7vjj6ylxanFe2A_2uJLgtNx` |

5. Click en **"Deploy"**. En 1-2 minutos te da un link real, algo como
   `https://tempo-app-tuusuario.vercel.app` — ese es el que compartes con tus
   profes y estudiantes de prueba.

## Cómo entran tus profes y estudiantes

- **Tú** (la primera profe): entra al link, click en "Crear cuenta", elige
  "Profesor", pon tu correo y contraseña. Ahí sigues igual que antes:
  agregas tus paquetes, tus estudiantes, etc.
- **El otro profe**: hace exactamente lo mismo — su propia cuenta, sus
  propios datos, separados de los tuyos.
- **Tus estudiantes**: primero **tú los agregas por su nombre** en la
  sección "Estudiantes" (como ya lo hacías). Después, ellos entran al link,
  "Crear cuenta" → "Estudiante" → eligen tu nombre en la lista de profes →
  eligen su nombre en la lista → ponen su correo y contraseña. Así su cuenta
  queda conectada a los datos que tú ya cargaste para ellos.

## Si algo no carga o da error

Lo más común es que falten las variables de entorno en Vercel, o que el
correo siga pidiendo confirmación (revisa el paso de arriba). Si ves un
error distinto, cópiamelo tal cual aparece y lo resolvemos.
