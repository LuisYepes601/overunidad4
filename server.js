require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';


const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// --- CONEXIÓN A BASE DE DATOS ---
// Si usas MongoDB Atlas, cambia la URL
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/app_registros_db')
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- MODELOS DE DATOS ---

// Modelo para las Tareas
const TaskSchema = new mongoose.Schema({
    username: { type: String, required: true },
    title: { type: String, required: true },
    description: String,
    category: { type: String, default: 'Normal' },
    isCompleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Modelo para Preferencias de Usuario (Sincroniza lo que tienes en main.dart)
const UserPrefsSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    isDarkMode: { type: Boolean, default: false },
    primaryColor: { type: Number, default: 0xFF6750A4 }
});

const Task = mongoose.model('Task', TaskSchema);
const UserPrefs = mongoose.model('UserPrefs', UserPrefsSchema);

// Modelo para Usuarios (registro / login)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// --- RUTAS DEL CRUD PARA TAREAS ---
// 1. OBTENER TAREAS (GET)
app.get('/api/tasks/:username', async (req, res) => {
    try {
        const tasks = await Task.find({ username: req.params.username }).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. ELIMINAR TODAS LAS TAREAS DE UN USUARIO (Importante: poner antes que :id)
app.delete('/api/tasks/all/:username', async (req, res) => {
    try {
        console.log(`🗑️ Eliminando historial completo de: ${req.params.username}`);
        await Task.deleteMany({ username: req.params.username });
        res.json({ message: 'Todo el historial ha sido eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. CREAR TAREA (POST)
app.post('/api/tasks', async (req, res) => {
    try {
        console.log("📥 Recibido nueva tarea:", req.body);
        const newTask = new Task(req.body);
        await newTask.save();
        console.log("✅ Tarea guardada con éxito");
        res.status(201).json(newTask);
    } catch (error) {
        console.error("❌ Error al guardar:", error.message);
        res.status(400).json({ error: error.message });
    }
});

// 4. ACTUALIZAR TAREA (PUT)
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedTask);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// 5. Eliminar tarea individual (DELETE)
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'Tarea eliminada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS PARA PREFERENCIAS (Opcional pero recomendado) ---
app.get('/api/prefs/:username', async (req, res) => {
    try {
        const prefs = await UserPrefs.findOne({ username: req.params.username });
        res.json(prefs || { message: "Sin preferencias" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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

// --- RUTAS DE AUTENTICACIÓN ---
// Ruta para registrar un nuevo usuario
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'Usuario creado' });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }
        res.status(400).json({ error: 'El usuario ya existe o datos inválidos' });
    }
});

// Ruta para iniciar sesión
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { username: user.username } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- INICIAR SERVIDOR ---
// Cambia esto
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Error: El puerto ${PORT} ya está en uso. Cierra el proceso anterior antes de reiniciar.`);
    } else {
        console.error(err);
    }
});
