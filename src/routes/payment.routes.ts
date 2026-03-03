import { Router } from 'express';
import { prisma } from '../config/prisma';
import { MercadoPagoConfig, Preference, PreApproval } from 'mercadopago';

const router = Router();

// Middleware de seguridad mejorado (Validar App y su Secret Key propia)
router.use(async (req, res, next) => {
    const appKey = req.headers['x-app-key'] as string;
    const secretKey = req.headers['x-api-key'] as string;

    if (!appKey || !secretKey) {
        return res.status(401).json({ error: 'Faltan credenciales (x-app-key o x-api-key)' });
    }

    try {
        const app = await (prisma as any).application.findUnique({
            where: { app_key: appKey }
        });

        if (!app || app.secret_key !== secretKey || !app.active) {
            return res.status(401).json({ error: 'Credenciales inválidas o aplicación desactivada.' });
        }
        next();
    } catch (error) {
        next(error);
    }
});

router.post('/create', async (req, res) => {
    const {
        app_id,
        external_reference,
        amount,
        currency,
        description,
        payer_email,
        metadata,
        payment_type = "one_time", // 'one_time' o 'subscription'
        frequency = "monthly"      // 'monthly', 'yearly', etc (solo usado si es subscription)
    } = req.body;

    // 1. Guardar la intención de pago en TU base de datos
    const paymentRecord = await prisma.payment.create({
        data: {
            app_id,
            external_reference,
            amount,
            currency: currency || 'ARS',
            description,
            payer_email,
            payment_type,
            frequency: payment_type === 'subscription' ? frequency : null,
            metadata: metadata || {}
        }
    });

    // 2. Comunicarse con Mercado Pago
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });

    try {
        let mercadopagoId = '';
        let initPoint = '';
        const backUrl = `https://tusubdominio.com/api/webhooks/mercadopago`; // Reemplazar en pro

        if (payment_type === 'subscription') {
            // FLUJO A: Suscripción Recurrente (Preapproval)
            const preApproval = new PreApproval(client);

            // Convertimos la frecuencia a formato MP
            let frequencyType = 'months';
            if (frequency === 'yearly') frequencyType = 'months'; // MP a veces usa meses para anual (ej: 12 months)
            let frequencyValue = frequency === 'yearly' ? 12 : 1;

            const mpResponse = await preApproval.create({
                body: {
                    reason: description,
                    external_reference: paymentRecord.id,
                    payer_email: payer_email,
                    auto_recurring: {
                        frequency: frequencyValue,
                        frequency_type: frequencyType,
                        transaction_amount: amount,
                        currency_id: currency || 'ARS'
                    },
                    back_url: backUrl,
                    status: "pending"
                }
            });

            mercadopagoId = String(mpResponse.id);
            initPoint = mpResponse.init_point as string;

            // Actualizar que es una suscripción
            await prisma.payment.update({
                where: { id: paymentRecord.id },
                data: {
                    subscription_id: mercadopagoId,
                    init_point: initPoint
                }
            });

        } else {
            // FLUJO B: Pago Único (Preference)
            const preference = new Preference(client);
            const mpResponse = await preference.create({
                body: {
                    items: [
                        {
                            id: paymentRecord.id,
                            title: description,
                            quantity: 1,
                            unit_price: amount,
                            currency_id: currency || 'ARS',
                        }
                    ],
                    payer: {
                        email: payer_email,
                    },
                    external_reference: paymentRecord.id, // Cruzamos el ID de nuestra DB con MP
                    statement_descriptor: app_id,
                    back_urls: {
                        success: `https://tusubdominio.com/api/webhooks/success`,
                        failure: `https://tusubdominio.com/api/webhooks/failure`,
                        pending: `https://tusubdominio.com/api/webhooks/pending`
                    },
                    auto_return: "approved",
                    notification_url: backUrl
                }
            });

            mercadopagoId = String(mpResponse.id);
            initPoint = mpResponse.init_point as string;

            await prisma.payment.update({
                where: { id: paymentRecord.id },
                data: {
                    mercadopago_id: mercadopagoId,
                    init_point: initPoint
                }
            });
        }

        // 4. Responder a nuestra App originaria
        return res.json({
            status: 'success',
            data: {
                payment_id: paymentRecord.id,
                payment_type,
                init_point: initPoint,
                external_reference
            }
        });

    } catch (error) {
        console.error("Error al crear intención de cobro en MP:", error);
        await prisma.payment.update({
            where: { id: paymentRecord.id },
            data: { status: 'rejected' }
        });
        return res.status(500).json({ error: 'Ocurrió un error al contactar con Mercado Pago' });
    }
});

export default router;
