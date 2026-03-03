import { Router } from 'express';
import { prisma } from '../config/prisma';

const router = Router();

// Middleware de seguridad (Reutilizamos la API Key por ahora para simplificar)
router.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY_SECRET) {
        return res.status(401).json({ error: 'No autorizado.' });
    }
    next();
});

// 1. Estadísticas Globales
router.get('/global', async (req, res) => {
    try {
        const stats = await prisma.payment.aggregate({
            _sum: { amount: true },
            _count: { id: true },
            where: { status: 'approved' }
        });

        const byApp = await prisma.payment.groupBy({
            by: ['app_id'],
            _sum: { amount: true },
            _count: { id: true },
            where: { status: 'approved' }
        });

        res.json({
            total_revenue: stats._sum.amount || 0,
            total_transactions: stats._count.id || 0,
            breakdown_by_app: byApp
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener estadísticas globales' });
    }
});

// 2. Transacciones con filtros
router.get('/transactions', async (req, res) => {
    try {
        const { app_id, status, limit = 50 } = req.query;

        const transactions = await prisma.payment.findMany({
            where: {
                ...(app_id ? { app_id: String(app_id) } : {}),
                ...(status ? { status: String(status) } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
        });

        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener transacciones' });
    }
});

export default router;
