import { Router } from 'express';
import { prisma } from '../config/prisma';

const router = Router();

// Middleware de seguridad: solo el dueño de la Casa de Pagos (con la master API KEY) puede crear apps
router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY_SECRET) {
        return res.status(401).json({ error: 'No autorizado para gestionar aplicaciones.' });
    }
    next();
});

// Listar todas las aplicaciones
router.get('/', async (req, res) => {
    const apps = await (prisma as any).application.findMany({
        orderBy: { createdAt: 'desc' }
    });
    res.json(apps);
});

// Crear una nueva aplicación
router.post('/create', async (req, res) => {
    const { name, app_key, allowed_origins, webhook_url } = req.body;

    try {
        const newApp = await (prisma as any).application.create({
            data: {
                name,
                app_key,
                allowed_origins,
                webhook_url,
            }
        });
        res.json({ status: 'success', data: newApp });
    } catch (error) {
        res.status(400).json({ error: 'Error al crear la aplicación. El app_key debe ser único.' });
    }
});

// Actualizar una aplicación
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, allowed_origins, webhook_url, active } = req.body;

    const updatedApp = await (prisma as any).application.update({
        where: { id },
        data: { name, allowed_origins, webhook_url, active }
    });

    res.json({ status: 'success', data: updatedApp });
});

export default router;
