import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import 'express-async-errors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

import path from 'path';
import paymentRoutes from './routes/payment.routes';
import webhookRoutes from './routes/webhook.routes';
import statsRoutes from './routes/stats.routes';
import viewRoutes from './routes/view.routes';
import appRoutes from './routes/app.routes';
import { prisma } from './config/prisma';

// Configuración de motor de plantillas (MVC)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configuración de CORS con Whitelist Dinámica (Base de Datos)
const corsOptions = {
  origin: async (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Permitir peticiones sin origen (móviles/curl), en desarrollo, o desde localhost
    if (!origin || origin.includes('localhost') || process.env.NODE_ENV === 'development') return callback(null, true);

    // Buscar si el origen está permitido en alguna de nuestras apps registradas
    const appWithOrigin = await (prisma as any).application.findFirst({
      where: {
        allowed_origins: { contains: origin },
        active: true
      }
    });

    if (appWithOrigin) {
      callback(null, true);
    } else {
      callback(new Error('Dominio no permitido por la Casa de Pagos'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Fase 5: Gestión de Aplicaciones (Multi-tenant)
app.use('/api/apps', appRoutes);

// Verificación de estado del servidor
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'La Casa de Pagos está en línea' });
});

app.use('/dashboard', viewRoutes);

// Fase 2: Payments (Crear Links de Pago)
app.use('/api/payments', paymentRoutes);

// Fase 3: Webhooks de Mercado Pago
app.use('/api/webhooks', webhookRoutes);

// Fase 4: API de Reporting (JSON)
app.use('/api/stats', statsRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
