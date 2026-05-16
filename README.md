# API de Gestión de Tareas

API REST profesional construida con Express.js y MongoDB para gestionar tareas, autenticación JWT y preferencias de usuario.

## Requisitos Previos

- Node.js (v18 o superior recomendado)
- MongoDB (corriendo en localhost:27017)
- npm o yarn

## Configuración e Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Crea un archivo `.env` en la raíz del proyecto y añade tus credenciales:
```env
PORT=3001
MONGO_URI=mongodb://127.0.0.1:27017/app_registros_db
JWT_SECRET=tu_clave_secreta_aqui
```

## Uso

### Desarrollo (con nodemon)
```bash
npm run dev
```

### Producción
```bash
npm start
```

El servidor estará disponible en: `http://localhost:3001`

## Endpoints

### Autenticación
- **POST** `/api/register` - Registro de nuevo usuario
- **POST** `/api/login` - Inicio de sesión (Retorna token JWT para usar en el Header `Authorization: Bearer <token>`)

### Tareas
- **GET** `/api/tasks/:username` - Obtener tareas de un usuario
- **POST** `/api/tasks` - Crear nueva tarea
- **PUT** `/api/tasks/:id` - Actualizar una tarea
- **DELETE** `/api/tasks/:id` - Eliminar una tarea
- **DELETE** `/api/tasks/all/:username` - Eliminar historial completo de un usuario

### Preferencias de Usuario
- **GET** `/api/prefs/:username` - Obtener preferencias de usuario
- **POST** `/api/prefs` - Guardar/actualizar preferencias

## Estructura de Datos

### Task
```json
{
  "username": "string",
  "title": "string",
  "description": "string",
  "category": "string",
  "isCompleted": "boolean",
  "createdAt": "date"
}
```

### UserPrefs
```json
{
  "username": "string",
  "isDarkMode": "boolean",
  "primaryColor": "number"
}
```

## Notas

- Para Flutter, usa la IP privada de tu máquina en lugar de localhost
- MongoDB debe estar corriendo antes de iniciar la API
