import { Router } from 'express';
import { prisma } from '../config/prisma';
import { Payment, MercadoPagoConfig } from 'mercadopago';

const router = Router();
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const payment = new Payment(client);

router.post('/mercadopago', async (req, res) => {
    try {
        const { type, data } = req.body; // MP nos avisa del tipo de notificación y datos

        // Sólo nos interesa cuando el evento es sobre un "payment"
        if (type === 'payment') {
            const mercadopagoPaymentId = data.id;

            // 1. Ir a buscar la verdad a Mercado Pago
            const paymentInfo = await payment.get({ id: mercadopagoPaymentId });

            // Cruzamos el external_reference de MP (que es nuestro paymentRecord.id original)
            const internalPaymentId = paymentInfo.external_reference;

            if (!internalPaymentId) {
                return res.status(400).send('No external reference provided');
            }

            // 2. Actualizar nuestra Base de Datos
            const updatedPaymentInDb = await prisma.payment.update({
                where: { id: internalPaymentId },
                data: {
                    status: paymentInfo.status || 'unknown',
                    raw_webhook_data: paymentInfo as object // guardamos el log completo por si acaso
                }
            });

            // 3. (OPCIONAL/AVANZADO) Aquí es donde notificaríamos a la App originaria 
            // (ej. hacer un fetch/axios a "nutricion_app.com/api/webhooks/pago_ok")
            if (paymentInfo.status === 'approved') {
                console.log(`🤑 Pago APROBADO para la app: ${updatedPaymentInDb.app_id}`);
                // await fetch('url-app...', ...)
            }
        }

        // MP siempre espera un estatus 200 rápido para saber que recibimos la notificación, 
        // sino la volverá a enviar muchas veces.
        res.status(200).send('OK');
    } catch (error) {
        console.error("Error procesando Webhook de MP:", error);
        // Respondemos > 400 para que MP intente de nuevo en unas horas
        res.status(500).send('Webhook process failed');
    }
});

export default router;
