require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ─── Validación de variables de entorno requeridas ───────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3001;

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

// ─── Health check (necesario para Render) ────────────────────────────────────
app.get('/', (_req, res) => res.json({ status: 'ok', message: 'API funcionando ✅' }));

// ─── Conexión a MongoDB ───────────────────────────────────────────────────────
mongoose
    .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000, // Falla rápido si no conecta
        socketTimeoutMS: 45000,
    })
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch((err) => {
        console.error('❌ Error de conexión a MongoDB:', err.message);
        process.exit(1); // Render reiniciará el servicio automáticamente
    });

// ─── Modelos ──────────────────────────────────────────────────────────────────

const TaskSchema = new mongoose.Schema({
    username:    { type: String, required: true, index: true },
    title:       { type: String, required: true },
    description: { type: String, default: '' },
    category:    { type: String, default: 'Normal' },
    isCompleted: { type: Boolean, default: false },
    createdAt:   { type: Date, default: Date.now },
});

const UserPrefsSchema = new mongoose.Schema({
    username:     { type: String, required: true, unique: true },
    isDarkMode:   { type: Boolean, default: false },
    primaryColor: { type: Number, default: 0xFF6750A4 },
});

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const Task     = mongoose.model('Task', TaskSchema);
const UserPrefs = mongoose.model('UserPrefs', UserPrefsSchema);
const User     = mongoose.model('User', UserSchema);

// ─── Middleware de autenticación JWT ─────────────────────────────────────────
/**
 * Protege rutas: requiere header  Authorization: Bearer <token>
 * También verifica que el usuario del token coincida con el recurso solicitado.
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { username, iat, exp }
        next();
    } catch {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
}

/**
 * Verifica que el usuario autenticado sea dueño del recurso solicitado.
 * Llama después de authMiddleware.
 * Toma el username del param :username o del body.
 */
function ownerMiddleware(req, res, next) {
    const resourceOwner = req.params.username || req.body?.username;
    if (req.user.username !== resourceOwner) {
        return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso' });
    }
    next();
}

// ─── Rutas de autenticación (públicas) ───────────────────────────────────────

// POST /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'username y password son requeridos' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username: username.trim().toLowerCase(), password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'username y password son requeridos' });
        }
        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { username: user.username } });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ─── Rutas de tareas (protegidas) ────────────────────────────────────────────

// GET /api/tasks/:username — Obtener tareas
app.get(
    '/api/tasks/:username',
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        try {
            const tasks = await Task.find({ username: req.params.username }).sort({ createdAt: -1 });
            res.json(tasks);
        } catch {
            res.status(500).json({ error: 'Error al obtener tareas' });
        }
    }
);

// DELETE /api/tasks/all/:username — Eliminar historial completo
// ⚠️ DEBE ir antes de DELETE /api/tasks/:id para que Express no confunda "all" con un id
app.delete(
    '/api/tasks/all/:username',
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        try {
            await Task.deleteMany({ username: req.params.username });
            res.json({ message: 'Historial eliminado correctamente' });
        } catch {
            res.status(500).json({ error: 'Error al eliminar historial' });
        }
    }
);

// POST /api/tasks — Crear tarea
app.post(
    '/api/tasks',
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        try {
            const { username, title, description, category } = req.body;
            if (!title) {
                return res.status(400).json({ error: 'El título es requerido' });
            }
            const newTask = new Task({ username, title, description, category });
            await newTask.save();
            res.status(201).json(newTask);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// PUT /api/tasks/:id — Actualizar tarea
app.put(
    '/api/tasks/:id',
    authMiddleware,
    async (req, res) => {
        try {
            // Verificar que la tarea pertenece al usuario autenticado
            const task = await Task.findById(req.params.id);
            if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
            if (task.username !== req.user.username) {
                return res.status(403).json({ error: 'No tienes permiso para modificar esta tarea' });
            }
            const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
            res.json(updatedTask);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// DELETE /api/tasks/:id — Eliminar tarea individual
app.delete(
    '/api/tasks/:id',
    authMiddleware,
    async (req, res) => {
        try {
            const task = await Task.findById(req.params.id);
            if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
            if (task.username !== req.user.username) {
                return res.status(403).json({ error: 'No tienes permiso para eliminar esta tarea' });
            }
            await Task.findByIdAndDelete(req.params.id);
            res.json({ message: 'Tarea eliminada' });
        } catch {
            res.status(500).json({ error: 'Error al eliminar tarea' });
        }
    }
);

// ─── Rutas de preferencias (protegidas) ──────────────────────────────────────

// GET /api/prefs/:username
app.get(
    '/api/prefs/:username',
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        try {
            const prefs = await UserPrefs.findOne({ username: req.params.username });
            res.json(prefs || { username: req.params.username, isDarkMode: false, primaryColor: 0xFF6750A4 });
        } catch {
            res.status(500).json({ error: 'Error al obtener preferencias' });
        }
    }
);

// POST /api/prefs
app.post(
    '/api/prefs',
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        try {
            const { username, isDarkMode, primaryColor } = req.body;
            const prefs = await UserPrefs.findOneAndUpdate(
                { username },
                { isDarkMode, primaryColor },
                { upsert: true, new: true }
            );
            res.json(prefs);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
);

// ─── Ruta catch-all para 404 ──────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ─── Servidor ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

// Cierre limpio (necesario para Render)
const shutdown = async (signal) => {
    console.log(`\n${signal} recibido. Cerrando servidor...`);
    server.close(async () => {
        await mongoose.connection.close();
        console.log('✅ Conexión a MongoDB cerrada. Proceso terminado.');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));