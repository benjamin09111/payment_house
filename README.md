# 🏠 La Casa de Pagos (Payment Gateway Centralizado)

Bienvenido a la **Casa de Pagos**, tu microservicio central multi-tenant para gestionar transacciones de Mercado Pago entre todas tus aplicaciones (Danza, Nutrición, etc.). 

Este servicio actúa como intermediario absoluto: ninguna de tus apps necesita instalar el SDK de Mercado Pago. Todas se comunican con esta API, y esta API se comunica con el banco.

---

## 🚀 Flujo de Integración General

El flujo de vida de un pago sigue estos pasos:

1. **Registro de tu App:** Registras tu aplicación en el Dashboard (`/dashboard/apps`) para obtener tu `app_key` y tu `secret_key`.
2. **Creación del Pago:** Tu app solicita a la Casa de Pagos crear una transacción enviando los headers de seguridad. La Casa de Pagos la registra e interactúa con Mercado Pago, devolviendo a tu app el link de pago (`init_point`).
3. **Procesamiento:** El usuario paga en Mercado Pago (fuera de tu app).
4. **Confirmación (Webhook):** Mercado Pago notifica a la Casa de Pagos. La Casa de Pagos actualiza su base de datos y *notifica* de vuelta a tu app.

---

## 🛠️ Cómo implementar en tu App (Ejemplo Front-end React / Vite)

A continuación, la manera más simple de consumir la Casa de Pagos directamente desde el frontend de tu aplicación (como un botón de "Comprar" en React).

> **Aviso de Seguridad:** Gracias a la configuración estricta de CORS centralizada, puedes llamar a la API directamente desde React. La Casa de Pagos rechazará la petición si no proviene de un dominio exacto que tú hayas autorizado en el Dashboard.

### A) Ejemplo de Código: Cobro Único (React JSX / Fetch)

```jsx
import React, { useState } from 'react';

export const CheckoutButton = () => {
  const [loading, setLoading] = useState(false);

  const handleComprar = async () => {
    setLoading(true);
    try {
      // 1. Llamamos a nuestra Casa de Pagos Centralizada
      const response = await fetch('http://localhost:3000/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // ⚠️ Reemplaza estos valores por los que generaste en el Dashboard de Gestión de Apps
          'x-app-key': 'nutricion_app', // El ID de tu App
          'x-api-key': 'TU_SECRET_KEY_GENERADA_EN_EL_DASHBOARD' // Tu clave secreta
        },
        body: JSON.stringify({
          app_id: 'nutricion_app',
          external_reference: `orden_${Date.now()}`, // Un ID de orden único de tu sistema
          amount: 15500.50,
          currency: 'ARS',
          description: 'Plan Nutricional 3 Meses',
          payer_email: 'cliente@email.com',
          metadata: {
            nombre_alumno: "Juan Perez",
            plan_id: "plan_mensual_3"
          }
        })
      });

      const result = await response.json();

      // 2. Si todo salió bien, redirigimos al usuario a Mercado Pago
      if (result.status === 'success' && result.data.init_point) {
        window.location.href = result.data.init_point;
      } else {
        alert('Error al generar el link de pago');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleComprar} 
      disabled={loading}
      style={{ padding: '10px 20px', background: '#6366f1', color: '#fff', borderRadius: '5px' }}
    >
      {loading ? 'Cargando Mercado Pago...' : 'Pagar con Mercado Pago'}
    </button>
  );
};
```

### B) Ejemplo de Código: Suscripción Mensual (Membresías)

Si deseas cobrar reiteradamente todos los meses, simplemente añade `payment_type` y `frequency` al cuerpo de la petición. "La Casa de Pagos" entenderá automáticamente que debe conectarse al servicio de **Preapproval** de Mercado Pago.

```javascript
        body: JSON.stringify({
          app_id: 'nutricion_app',
          external_reference: `orden_${Date.now()}`,
          amount: 15500.50,
          currency: 'ARS',
          description: 'Suscripción Mensual VIP',
          payer_email: 'cliente@email.com',
          
          // ---- NUEVOS PARÁMETROS DE SUSCRIPCIÓN ----
          payment_type: 'subscription', // Le dice a la pasarela que es un cargo recurrente
          frequency: 'monthly',         // Puede ser 'monthly' (mensual) o 'yearly' (anual)
          // ------------------------------------------

          metadata: {
            plan_id: "suscripcion_mensual_vip"
          }
        })
```

---

## 🔔 Enterarte de que un pago fue completado

Hay **dos estrategias** que tu aplicación origen puede utilizar para saber si el usuario finalmente pagó.

### Estrategia A: Webhooks Salientes (Proactivo - Recomendado)
Cuando en el Dashboard configuras la URL de **Webhook** de tu aplicación, la Casa de Pagos enviará automáticamente un POST a esa URL cuando el pago se apruebe.

Tu backend (el de la App de Nutrición, por ejemplo) recibirá algo como esto:
```json
{
  "app_id": "nutricion_app",
  "external_reference": "orden_12345",
  "status": "approved",
  "metadata": {
    "nombre_alumno": "Juan Perez",
    "plan_id": "plan_mensual_3"
  }
}
```
> **Acción de tu app:** Al recibir esto, liberas el contenido del plan, activa la cuenta del usuario leyendo su `external_reference` o los datos en `metadata`, y respondes un HTTP `200 OK`.

### Estrategia B: Consulta Manual (Polling)
*(Aún en desarrollo; próximamente un endpoint para pedir manualmente el estado a la Casa de Pagos)*

---

## 🏃🏽 Puesta en Marcha Local (Desarrollador)

Para encender la "Casa de Pagos" mientras programas:

1. Clona el repositorio e instala las dependencias:
   ```bash
   npm install
   ```
2. Crea un archivo `.env` en la raíz (copia el contendo de `.env.example`) y configura tu `DATABASE_URL` (Ej. Neon.tech Postgres) y tus claves de Mercado Pago.
3. Levanta el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Ingresa al Dashboard para gestionar tus aplicaciones: **`http://localhost:3000/dashboard`**

---

## 🌍 Despliegue en Producción (¡Gratis y Fácil!)

Para que tus aplicaciones reales puedan comunicarse con tu Casa de Pagos, necesitas subirla a Internet. Aquí tienes la guía recomendada usando servicios seguros y de capa gratuita:

### Paso 1: Base de Datos (Neon.tech) - ¡Ya lo tienes!
1. Tú ya estás utilizando **Neon.tech** (PostgreSQL Serverless). 
2. Esa URL (`postgresql://...`) que tienes en tu `.env` local es la misma que usarás en producción. No tienes que hacer nada más; tu base de datos ya está en la nube.

### Paso 2: Servidor Node.js (Render.com o Railway.app)
Recomendamos **Render.com** por su capa gratuita ideal para APIs.

1. Crea una cuenta gratuita en [Render.com](https://render.com/).
2. Conecta tu cuenta de **GitHub** y selecciona el repositorio donde subiste este código de "La Casa de Pagos".
3. Crea un nuevo **"Web Service"**.
4. En la configuración del servicio, rellena lo siguiente:
   - **Environment:** Node
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
5. **Variables de Entorno (Environment Variables):**
   Render te pedirá tus variables de entorno. Copia exactamente las mismas que tienes en tu `.env` local:
   - `DATABASE_URL` (Tu URL de Neon.tech)
   - `MP_ACCESS_TOKEN` (Tu token de producción de Mercado Pago)
   - `MP_WEBHOOK_SECRET` (Opcional, de Mercado Pago)
   - `API_KEY_SECRET` (Genera una clave larga y difícil aquí. Es la que protege tu Dashboard).

### Paso 3: ¡Listo!
Render te dará una URL pública gratuita (ej: `https://la-casa-de-pagos.onrender.com`).
Desde ese momento, deberás cambiar el `fetch` en tus aplicaciones de React/Vue para que dejen de apuntar a `http://localhost:3000` y apunten a tu nueva URL de Render.

¡Ya tienes tu propia pasarela de pagos corriendo profesionalmente en la nube! 🚀
