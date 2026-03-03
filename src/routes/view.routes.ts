import { Router } from 'express';
import { prisma } from '../config/prisma';

const router = Router();

// El Dashboard es una vista pública o con seguridad de sesión (por ahora libre para que lo veas)
router.get('/', async (req, res) => {
    try {
        // 1. Obtener estadísticas globales
        // Ingresos de pagos únicos (one_time)
        const one_time_stats = await prisma.payment.aggregate({
            _sum: { amount: true },
            _count: { id: true },
            where: { status: 'approved', payment_type: 'one_time' }
        });

        // MRR (Ingresos Recurrentes Mensuales de Suscripciones activas)
        const subscription_stats = await prisma.payment.aggregate({
            _sum: { amount: true },
            _count: { id: true },
            where: { status: 'approved', payment_type: 'subscription' } // Asumiendo 'approved' significa suscripción activa
        });

        const breakdown_by_app = await prisma.payment.groupBy({
            by: ['app_id', 'payment_type'],
            _sum: { amount: true },
            _count: { id: true },
            where: { status: 'approved' }
        });

        // 1.5 Obtener todas las apps para mostrarlas incluso sin transacciones
        const all_apps = await (prisma as any).application.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const totalRevenue = (one_time_stats._sum.amount || 0) + (subscription_stats._sum.amount || 0);

        const stats = {
            total_revenue: totalRevenue,
            mrr: subscription_stats._sum.amount || 0,
            one_time_revenue: one_time_stats._sum.amount || 0,
            total_transactions: (one_time_stats._count.id || 0) + (subscription_stats._count.id || 0),
            breakdown_by_app,
            all_apps
        };

        // 2. Obtener últimas transacciones
        const transactions = await prisma.payment.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // 3. Renderizar la vista EJS del Dashboard
        res.render('dashboard', { stats, transactions });
    } catch (error) {
        console.error("Error cargando dashboard:", error);
        res.status(500).send("Error al cargar el panel de control");
    }
});

// Ruta para gestionar aplicaciones
router.get('/apps', async (req, res) => {
    try {
        const apps = await (prisma as any).application.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.render('apps', {
            apps,
            apiKey: process.env.API_KEY_SECRET
        });
    } catch (error) {
        res.status(500).send("Error al cargar la gestión de aplicaciones");
    }
});

export default router;
