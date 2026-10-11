// EverAfterWear — Servidor de pagos Pi Network
// Aprueba y completa pagos de Pi llamando a la Pi Platform API.
// La API Key vive SOLO en la variable de entorno PI_API_KEY (Render).
// Nunca escribas la llave en este archivo.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PI_API_KEY = process.env.PI_API_KEY;
const PI_VALIDATION_KEY = process.env.PI_VALIDATION_KEY;
const PI_API_BASE = 'https://api.minepi.com/v2';

// Salud del servidor
app.get('/', (req, res) => {
  res.type('text').send('OK — EverAfterWear Pi Payments Server');
});

// Página de prueba del botón de pago (sandbox/Testnet) — se abre desde el Pi Browser
app.get('/pagar', (req, res) => {
  res.sendFile(path.join(__dirname, 'pagar.html'));
});

// Clave de validación del dominio (pública por diseño: Pi la lee desde una URL abierta).
// Shopify redirige /validation-key.txt hacia esta ruta del servidor.
app.get('/validation-key.txt', (req, res) => {
  if (!PI_VALIDATION_KEY) {
    return res.status(500).type('text').send('Falta la variable de entorno PI_VALIDATION_KEY en el servidor.');
  }
  res.type('text').send(PI_VALIDATION_KEY);
});

// Llamada genérica a la Pi Platform API
async function llamarPi(ruta, cuerpo) {
  if (!PI_API_KEY) {
    const err = new Error('Falta la variable de entorno PI_API_KEY en el servidor.');
    err.status = 500;
    throw err;
  }
  const respuesta = await fetch(`${PI_API_BASE}${ruta}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${PI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = { raw: texto }; }
  if (!respuesta.ok) {
    const err = new Error(`Pi API respondió ${respuesta.status}`);
    err.status = 502;
    err.detalle = datos;
    throw err;
  }
  return datos;
}

// Paso 1 del pago: el cliente lo creó en la tienda, el servidor lo aprueba
app.post('/approve', async (req, res) => {
  const { paymentId } = req.body || {};
  if (!paymentId) {
    return res.status(400).json({ error: 'Falta paymentId en el cuerpo de la petición.' });
  }
  try {
    const pago = await llamarPi(`/payments/${paymentId}/approve`);
    res.json({ ok: true, payment: pago });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detalle: err.detalle || null });
  }
});

// Paso 2 del pago: la transacción ya está en la blockchain, el servidor la completa
app.post('/complete', async (req, res) => {
  const { paymentId, txid } = req.body || {};
  if (!paymentId) {
    return res.status(400).json({ error: 'Falta paymentId en el cuerpo de la petición.' });
  }
  if (!txid) {
    return res.status(400).json({ error: 'Falta txid en el cuerpo de la petición.' });
  }
  try {
    const pago = await llamarPi(`/payments/${paymentId}/complete`, { txid });
    res.json({ ok: true, payment: pago });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detalle: err.detalle || null });
  }
});

// Pago incompleto encontrado al autenticar (el cliente lo retoma o se cancela)
app.post('/incomplete', async (req, res) => {
  const { paymentId } = req.body || {};
  if (!paymentId) {
    return res.status(400).json({ error: 'Falta paymentId en el cuerpo de la petición.' });
  }
  // Solo lo registramos; la tienda decide qué hacer con la orden.
  console.log('Pago incompleto detectado:', paymentId);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor Pi escuchando en el puerto ${PORT}`);
});
