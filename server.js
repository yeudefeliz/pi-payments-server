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
// Red Pi: Mainnet por defecto; en Testnet se pone PI_API_BASE=https://api.testnet.minepi.com/v2
const PI_API_BASE = process.env.PI_API_BASE || 'https://api.minepi.com/v2';
// Solo pa' pagos App-to-User (A2U): semilla de la wallet de la app + clave de admin.
// Viven SOLO en variables de entorno (Render). Nunca en este archivo ni en el chat.
const PI_WALLET_SEED = process.env.PI_WALLET_SEED;
const A2U_ADMIN_TOKEN = process.env.A2U_ADMIN_TOKEN;

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

// ─── Registro de visitas (uids) ────────────────────────────────────
// La página /pagar avisa cada autenticación; guardamos uid+username únicos
// pa' saber a quién enviarle los pagos A2U del requisito del portal.
// Vive en memoria: si el servidor reinicia, la lista se borra (se recogen y se paga en la misma sesión).
const visitas = new Map();
app.post('/visita', (req, res) => {
  const { uid, username } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'Falta uid.' });
  visitas.set(uid, { uid, username: username || '', cuando: new Date().toISOString() });
  console.log('Visita registrada:', username || '(sin nombre)', uid);
  res.json({ ok: true, total: visitas.size });
});
app.get('/a2u/visitas', (req, res) => {
  if (!esAdmin(req)) return res.status(401).json({ error: 'Token de admin inválido.' });
  res.json({ ok: true, total: visitas.size, visitas: [...visitas.values()] });
});

// ─── App-to-User (A2U) ─────────────────────────────────────────────
// Envía un pago DESDE la wallet de la app HACIA un usuario (por su uid de Pi).
// Requisito del portal pa' la wallet Mainnet: 5 pagos A2U en Testnet a 5 wallets únicas.
// Protegido con A2U_ADMIN_TOKEN (header x-admin-token). Todo por variables de entorno.
function a2uListo(res) {
  if (!PI_WALLET_SEED || !A2U_ADMIN_TOKEN) {
    res.status(500).json({ error: 'A2U no configurado: faltan PI_WALLET_SEED y/o A2U_ADMIN_TOKEN en el servidor.' });
    return false;
  }
  return true;
}
function esAdmin(req) {
  return req.get('x-admin-token') && req.get('x-admin-token') === A2U_ADMIN_TOKEN;
}

app.post('/a2u', async (req, res) => {
  if (!a2uListo(res)) return;
  if (!esAdmin(req)) return res.status(401).json({ error: 'Token de admin inválido.' });
  const { uid, amount, memo } = req.body || {};
  if (!uid) return res.status(400).json({ error: 'Falta uid (el id de usuario Pi del destinatario).' });
  const monto = Number(amount) > 0 ? Number(amount) : 0.1;
  try {
    const PiBackend = require('pi-backend').default || require('pi-backend');
    const pi = new PiBackend(PI_API_KEY, PI_WALLET_SEED);
    const paymentData = {
      amount: monto,
      memo: memo || 'EverAfterWear — pago de prueba A2U',
      metadata: { tipo: 'a2u-requisito-portal' },
      uid,
    };
    const paymentId = await pi.createPayment(paymentData);
    const txid = await pi.submitPayment(paymentId);
    const pago = await pi.completePayment(paymentId, txid);
    res.json({ ok: true, paymentId, txid, status: pago && pago.status ? pago.status : null });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Error en el pago A2U', detalle: err.response && err.response.data ? err.response.data : null });
  }
});

// Lista pagos A2U incompletos (creados sin completar) pa' limpiarlos si algo se tranca
app.get('/a2u/incompletos', async (req, res) => {
  if (!a2uListo(res)) return;
  if (!esAdmin(req)) return res.status(401).json({ error: 'Token de admin inválido.' });
  try {
    const PiBackend = require('pi-backend').default || require('pi-backend');
    const pi = new PiBackend(PI_API_KEY, PI_WALLET_SEED);
    const lista = await pi.getIncompleteServerPayments();
    res.json({ ok: true, incompletos: lista });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Error listando incompletos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Pi escuchando en el puerto ${PORT}`);
});
