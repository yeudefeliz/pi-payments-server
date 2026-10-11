# EverAfterWear — Servidor de pagos Pi Network

Este servidor es el "puente" entre tu tienda de Shopify y Pi Network.
Shopify solo no puede aprobar pagos de Pi: cuando un cliente paga con Pi,
este servidor le confirma a Pi "aprobado" (`/approve`) y al final
"completado" (`/complete`). Sin servidor, el pago se queda a mitad.

**Importante:** el pago con Pi solo le funciona al cliente que abre tu
tienda **desde el Pi Browser**. Y todo arranca en **modo sandbox**
(dinero de prueba, Test-Pi) hasta que tú decidas pasar a producción.

---

## Paso 1 — Registrar tu app en Pi y conseguir la API Key

1. Abre el **Pi Browser** en tu teléfono e inicia sesión con tu cuenta de Pi.
2. Ve al **Pi Developer Portal** (en el Pi Browser: la sección de
   desarrolladores / "Develop" — también puedes escribir
   `develop.pi` en la barra del Pi Browser).
3. Crea una **app nueva**: ponle un nombre (ej. "EverAfterWear") y la URL
   de tu tienda: `https://everafterwear.store`.
4. Dentro de la app, busca la sección **API Key** y cópiala.
   ⚠️ Esa llave es secreta: no la mandes por chat ni la publiques.
   Solo se pega en Render (Paso 2).
5. Nota: Pi también pide validar que el dominio es tuyo. Shopify limita
   servir el archivo de validación, por eso la prueba del SDK vive en tu
   **tema duplicado** (no en el tema en vivo).

## Paso 2 — Desplegar el servidor en Render (gratis, como Citas NH)

1. Sube esta carpeta (`pi-payments-server`) a un repositorio de GitHub
   (o conéctala como hiciste con Citas NH).
2. En [render.com](https://render.com) → **New → Web Service** → elige el
   repositorio.
3. Render detecta el archivo `render.yaml` y configura solo:
   - Build: `npm install`
   - Start: `npm start`
   - Plan: **Free**
4. En la sección **Environment** del servicio, agrega la variable:
   - Nombre: `PI_API_KEY`
   - Valor: la llave que copiaste en el Paso 1.
5. Dale **Deploy** y espera a que diga "Live".
6. Copia la **URL pública** del servicio, algo como:
   `https://everafterwear-pi-payments.onrender.com`
7. Prueba la URL en tu navegador: debe decir
   "OK — EverAfterWear Pi Payments Server".

## Paso 3 — Conectar el botón en el tema duplicado de Shopify

1. Abre el archivo `shopify-snippet.html` de esta carpeta.
2. Busca `TU-SERVIDOR.onrender.com` (aparece 3 veces: 2 en comentarios y
   1 en la línea `EAW_PI_SERVER`) y cámbialo por tu URL real de Render.
3. Pega el snippet completo en el **tema duplicado** (en la plantilla del
   carrito o del producto) — **nunca en el tema en vivo todavía**.
4. Abre la tienda (vista previa del tema duplicado) **desde el Pi
   Browser** y prueba el botón "Pagar con Pi" en modo sandbox.

## Paso 4 — Cuando todo funcione en prueba

1. Publica el tema duplicado solo cuando la prueba salga bien.
2. Pa' cobrar Pi de verdad: en el snippet cambia `sandbox: true` por
   `sandbox: false`, y en el Developer Portal pasa tu app a producción.
3. El método manual "Pago con Pi Network" que ya tienes en Shopify puede
   quedarse como respaldo.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `server.js` | El servidor (endpoints `/`, `/approve`, `/complete`, `/incomplete`) |
| `package.json` | Configuración de Node (solo usa Express) |
| `render.yaml` | Receta de despliegue pa' Render |
| `shopify-snippet.html` | Botón "Pagar con Pi" pa' pegar en el tema duplicado |

## Notas técnicas

- La API Key se lee **solo** de la variable de entorno `PI_API_KEY`.
  No está escrita en ningún archivo.
- Si falta `paymentId`, el servidor responde **400**. Si Pi responde
  error, el servidor responde **502** con el detalle.
- El plan Free de Render "duerme" el servidor tras un rato sin uso; el
  primer pago después de dormir puede tardar ~30–60 segundos en despertar.
