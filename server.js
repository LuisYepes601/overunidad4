require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Health check para Render
app.get('/', (_req, res) => res.json({ status: 'ok', message: 'API funcionando ✅' }));

// Conexión a MongoDB
mongoose
    .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch((err) => {
        console.error('❌ Error de conexión a MongoDB:', err.message);
        process.exit(1);
    });

// ─── Modelos ──────────────────────────────────────────────────────────────────

const TaskSchema = new mongoose.Schema({
    username: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'Normal' },
    isCompleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

const UserPrefsSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    isDarkMode: { type: Boolean, default: false },
    primaryColor: { type: Number, default: 0xFF6750A4 },
});

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const Task = mongoose.model('Task', TaskSchema);
const UserPrefs = mongoose.model('UserPrefs', UserPrefsSchema);
const User = mongoose.model('User', UserSchema);

// ─── Autenticación ────────────────────────────────────────────────────────────

// POST /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'username y password son requeridos' });
        if (password.length < 6)
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username: username.trim().toLowerCase(), password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        if (error?.code === 11000)
            return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'username y password son requeridos' });

        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

        res.json({ message: 'Login exitoso', user: { username: user.username } });
    } catch {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ─── Tareas ───────────────────────────────────────────────────────────────────

// GET /api/tasks/:username
app.get('/api/tasks/:username', async (req, res) => {
    try {
        const tasks = await Task.find({ username: req.params.username }).sort({ createdAt: -1 });

        if (tasks.length === 0) {
            return res.status(404).json({ message: 'El usuario no tiene tareas asignadas' });
        }

        res.json(tasks);
    } catch {
        res.status(500).json({ error: 'Error al obtener tareas' });
    }
});

// DELETE /api/tasks/all/:username — debe ir ANTES de /api/tasks/:id
app.delete('/api/tasks/all/:username', async (req, res) => {
    try {
        await Task.deleteMany({ username: req.params.username });
        res.json({ message: 'Historial eliminado correctamente' });
    } catch {
        res.status(500).json({ error: 'Error al eliminar historial' });
    }
});

// POST /api/tasks
app.post('/api/tasks', async (req, res) => {
    try {
        const { username, title, description, category } = req.body;
        if (!title) return res.status(400).json({ error: 'El título es requerido' });
        const newTask = new Task({ username, title, description, category });
        await newTask.save();
        res.status(201).json(newTask);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/tasks/:id
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedTask) return res.status(404).json({ error: 'Tarea no encontrada' });
        res.json(updatedTask);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
        res.json({ message: 'Tarea eliminada' });
    } catch {
        res.status(500).json({ error: 'Error al eliminar tarea' });
    }
});

// ─── Preferencias ─────────────────────────────────────────────────────────────

// GET /api/prefs/:username
app.get('/api/prefs/:username', async (req, res) => {
    try {
        const prefs = await UserPrefs.findOne({ username: req.params.username });
        res.json(prefs || { username: req.params.username, isDarkMode: false, primaryColor: 0xFF6750A4 });
    } catch {
        res.status(500).json({ error: 'Error al obtener preferencias' });
    }
});

// POST /api/prefs
app.post('/api/prefs', async (req, res) => {
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
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ─── Servidor ─────────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

const shutdown = async (signal) => {
    console.log(`\n${signal} recibido. Cerrando servidor...`);
    server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));