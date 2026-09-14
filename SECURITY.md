# Security · reglas para un repo PÚBLICO con keys de pago detrás

Este repo será público desde el día 1. Estas reglas se aplican antes del primer push y en cada parte.

## 1. Qué es secreto y qué no
| Variable | Dónde vive | Cliente? | Notas |
|----------|-----------|----------|-------|
| `ALCHEMY_KEY` | Vercel env (Production/Preview) + `.env.local` | NUNCA | Crear app Alchemy nueva SOLO para servidor. Sin `NEXT_PUBLIC_`. Activar en Alchemy: límite de CU/día y alertas de uso |
| `ANTHROPIC_API_KEY` | Vercel env + `.env.local` | NUNCA | Solo se usa en `app/api/ask/route.ts`. Poner spend limit en la consola de Anthropic |
| `SUPABASE_SECRET_KEY` | Vercel env + `.env.local` | NUNCA | Formato nuevo `sb_secret_...`. Bypassa RLS. Solo server |
| `NEXT_PUBLIC_ONCHAINKIT_API_KEY` | Vercel env + `.env.local` | Sí (por diseño) | Es pública por diseño; en el portal CDP restringir a los dominios permitidos |
| `NEXT_PUBLIC_SUPABASE_URL` / `PUBLISHABLE_KEY` | Vercel env | Sí (por diseño) | Formato nuevo `sb_publishable_...`. Seguras solo si RLS está activo en TODAS las tablas |
| `NEXT_PUBLIC_DEMO_WALLET` | Vercel env | Sí | No es secreto |

Regla: si una variable empieza por `NEXT_PUBLIC_`, asume que está impresa en la home. Nada de pago va con ese prefijo.

## 2. Git y GitHub
- `.gitignore` ya excluye `.env*` (salvo `.env.example`). Nunca comitear `.env.local`. `.env.example` solo con valores vacíos.
- Antes del primer push: instalar `gitleaks` y añadir hook pre-commit (`gitleaks protect --staged`). Correr `gitleaks detect` sobre todo el historial antes de hacer público el repo.
- En GitHub: activar Secret scanning + Push protection (Settings → Code security), Dependabot alerts, y branch protection en `main` (PR obligatorio o al menos no force-push).
- Si una key se filtra (aunque sea 1 minuto): rotarla de inmediato en el proveedor. Borrar el commit no sirve.
- No subir capturas de pantalla ni logs con headers/keys al repo o a X.

## 3. Vercel
- Env vars solo en el dashboard de Vercel (cifradas), separadas por entorno. No en `vercel.json`, no en el código.
- Desactivar "Automatically expose System Environment Variables" si no se usan.
- Revisar en cada deploy que el bundle del cliente no contiene secretos: `grep -r "sk-ant\|ALCHEMY" .next/static` debe devolver vacío.

## 4. API routes (superficie pública que gasta dinero)
- Rate limit por IP en TODAS las rutas (`lib/rateLimit.ts`): `/api/portfolio` 10/min, `/api/ask` 5/min, `/api/pools` 30/min.
- `/api/ask`: `max_tokens` acotado, historial limitado a N mensajes, sin ejecutar nada que venga del usuario, tools de solo lectura, timeout. Presupuesto diario global (contador en memoria o Supabase) que corta el endpoint si se excede.
- Validar toda entrada (`^0x[0-9a-fA-F]{40}$` para direcciones, rangos numéricos en simulate). Responder 400, nunca 500 con stack trace.
- Caché en memoria por wallet (TTL 5 min) para no repetir escaneos caros.
- CORS: mismo origen. No exponer las rutas como API pública en el MVP.

## 5. Supabase (cuando se active)
- RLS habilitado en todas las tablas (el `schema.sql` ya lo trae). Métrica de "capital conectado": tabla `wallet_snapshots` escrita solo desde el servidor con service role; lectura pública solo del agregado vía una vista o función, nunca de las filas.

## 6. Dependencias
- `npm audit` antes de cada release. Versiones fijadas exactas en `package.json`.
- Instalar solo paquetes conocidos (OnchainKit, wagmi, viem, ethers, recharts, Anthropic SDK, Supabase).

### Evaluación de vulnerabilidades · 5 sep 2026

Auditoría inicial: **38 vulnerabilidades, 3 críticas y 4 altas**. Casi todas son transitivas del
árbol de conectores de wallet que arrastra OnchainKit (WalletConnect, MetaMask SDK, Reown AppKit,
Farcaster Mini App SDK y, por esa vía, `@solana/web3.js`), no de código nuestro.

**Acción tomada**: `overrides` en `package.json` forzando `axios@1.20.0`, `ws@8.21.3` y
`elliptic@6.6.1`. Resultado: **0 críticas, 1 alta**, con el build intacto.

| Paquete | Severidad | De dónde viene | Evaluación |
|---|---|---|---|
| `elliptic` | era crítica | `@ethersproject/signing-key` ← ethers v5 | Resuelto por override a 6.6.1. Además, el motor **nunca firma nada** ni maneja claves privadas: los avisos son sobre firmar o verificar con entradas malformadas |
| `axios` | era alta | `@coinbase/cdp-sdk` ← conector `baseAccount` | Resuelto por override a 1.20.0. Ese SDK está en el árbol por el botón de conectar wallet; no lo llamamos |
| `ws` | era alta | `@ethersproject/providers` (WebSocketProvider) y WalletConnect | Resuelto por override a 8.21.3. No usamos WebSocketProvider ni corremos un servidor ws, que es contra lo que van esos DoS |
| `postcss` | alta | dentro de `next` | **Aceptada**. Es herramienta de build, no de runtime, y el ataque requiere CSS controlado por un atacante en tiempo de compilación. El CSS lo escribimos nosotros. El arreglo exige Next 16, que es un cambio mayor a tres días del deadline |
| resto (29 moderadas, 14 bajas) | | árbol de conectores de wallet | **Aceptadas para el MVP**. Son rutas de código que la app no ejecuta: relay de WalletConnect, SDK de MetaMask, Solana |

**Deuda registrada**: ethers v5 está en fin de vida y es el origen de dos de las críticas originales.
Migrar el motor a viem o a ethers v6 es trabajo post-aplicación, no de esta semana.

**Revisar de nuevo** antes de la fase Act (ejecución de transacciones). En cuanto la app firme algo,
la evaluación de `elliptic` y del árbol de wallet cambia por completo: hoy es aceptable justamente
porque la app es de solo lectura.

### Segunda pasada · 7 sep 2026

Punto de partida: **44 avisos (1 alta, 29 moderadas, 14 bajas)**. Tres `overrides` nuevos, sin tocar
una sola versión mayor: **0 altas, 0 moderadas, 14 bajas**, y las 14 bajas son un solo aviso.

| Paquete | Severidad | Qué se hizo |
|---|---|---|
| `postcss` | **alta** ×2 + moderada ×2 | La entrada anterior la dio por aceptada creyendo que exigía Next 16. Estaba mal: Next traía su propia copia `8.4.31` mientras el proyecto ya dependía de `8.5.28`, que no es vulnerable. `"postcss": "$postcss"` hace que Next use la nuestra. Un solo postcss en el árbol y la alta desaparece, sin cambio mayor |
| `stream-json` | moderada | DoS O(profundidad²) con JSON anidado. Llega por `jayson` ← `@solana/web3.js` ← Farcaster Mini App SDK. Override a `^3.6.0` |
| `decode-uri-component` | moderada | DoS por porcentajes malformados, vía `query-string` ← WalletConnect. Override a `^0.5.0` |
| `uuid` | moderada | Falta un chequeo de límites en v3/v5/v6 cuando se pasa `buf`. Llega por MetaMask SDK y `jayson`. Override a `^11.1.1`. Nada nuestro llama a uuid, y los conectores usan v4, que no está afectada; se arregla igual porque el override resuelve limpio |
| `elliptic` | baja | **Aceptada, y no tiene arreglo**: el aviso cubre todas las versiones publicadas. Entra por `@ethersproject/signing-key` ← ethers v5. Quitarla significa migrar el motor a ethers v6. Contra qué protege: firmar o verificar con entradas malformadas. Verificado por grep en `src/core`, `src/lib` y `src/app`: no existe `new ethers.Wallet`, ni `signMessage`, ni `signTransaction`, ni `getSigner`, ni ninguna clave privada. El motor **solo lee la cadena** |

Las 14 bajas restantes son el árbol de `@ethersproject/*` colgando de ese único aviso de `elliptic`:
un paquete por dependencia, no catorce problemas.

Comprobado después de los overrides: `npm run typecheck`, `npm test` (6 pruebas) y `npm run build`
pasan. Como los conectores de wallet solo se ejercitan en el navegador, el botón de conectar se
verifica en producción tras el deploy, no en el build.

## 7. Producto
- La app es de solo lectura: nunca pide firmas, nunca pide seed phrases, nunca construye transacciones. Decirlo en la UI.
- Disclaimers: informational only; tokenized stocks only in eligible jurisdictions outside the US.

## 8. Content-Security-Policy

La política va en dos mitades, y la división es deliberada.

**Se aplica hoy** (`Content-Security-Policy`): `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `img-src`, `font-src`, `frame-src`,
`worker-src`, `style-src`, `connect-src`, `default-src 'self'` y
`upgrade-insecure-requests`. Cada una se cerró sobre lo que el navegador
reportó, no sobre lo que suponíamos (§10 y §11).

`base-uri` impide que un `<base>` inyectado reapunte todas las URLs relativas
de la página al servidor de otro; `form-action` impide que un formulario mande
una dirección de wallet fuera del sitio. `connect-src` es la que de verdad
importa en un producto que lee el dinero de otra gente: el mal día realista no
es un script inyectado, es una dependencia comprometida, y esta es la directiva
que impide que esa dependencia mande lo que leyó a un sitio que nunca nombramos
— aunque su código llegue a ejecutarse.

**Solo reporta** (`Content-Security-Policy-Report-Only`): `script-src 'self'`,
que sigue midiéndose en vez de olvidarse. Necesita un nonce por request (§10),
o sea un `middleware.ts`, y un middleware que se salte un script deja la página
en blanco. Las violaciones van a `/api/csp-report`.

**Cómo se cierra lo que queda**: igual que se cerró el resto — leer los reportes
de tráfico real, añadir únicamente los orígenes que demuestren ser necesarios, y
mover la directiva a la mitad aplicada. No antes.

`/api/csp-report` no guarda nada: limita por IP, capa el cuerpo, corta a 10
reportes por POST y **reduce toda URL a origen + ruta antes de escribirla**,
porque `document-uri` lleva la dirección del wallet en el query string y
registrarla sería una fuga peor que la que la política previene.

**Ausentes a propósito**: `frame-ancestors` y `X-Frame-Options`. Esto es una
Base Mini App y está hecha para correr dentro del iframe de otro cliente.

## 9. CVE-2025-14505 en `elliptic` (14 avisos low, vía ethers v5)

**No tiene parche.** El aviso dice literalmente *"Patched versions: None"*, así
que `npm audit fix` no lo resuelve y forzarlo solo rompería ethers.

**Por qué no nos aplica**: el fallo está en la GENERACIÓN de firmas ECDSA —
`elliptic` calcula mal el largo en bytes de `k` cuando tiene ceros a la
izquierda, y alguien que consiga una firma defectuosa y una correcta del mismo
input podría derivar la clave privada. La verificación y la generación de
claves no están afectadas.

Esta app **nunca firma**. No instancia `ethers.Wallet`, no llama `signMessage`,
`signTransaction` ni `_signTypedData`, no usa `useSendTransaction` ni
`writeContract`, y no maneja claves privadas. Las firmas, cuando existen, las
hace el wallet del usuario en su propio proceso.

**Esto se verifica, no se asume**: `test/neverSigns.test.mjs` recorre todo
`src/` y falla si aparece cualquiera de esas llamadas. Si algún día se añade
firma a propósito, ese test se cae — y la respuesta correcta **no es borrarlo**,
es volver a leer el aviso y decidir de nuevo, porque el único motivo por el que
hoy no nos afecta es que no tocamos ese camino.

## 10. Lo que la CSP en modo reporte encontró (14 sep 2026)

La política report-only hizo su trabajo la primera vez que se cargó una página.
Esto es lo que el navegador dijo, textual, y qué se hizo con cada cosa.

**Telemetría a terceros que nadie había pedido.** Dos rutas distintas:

1. **OnchainKit** reporta uso a `https://api.developer.coinbase.com/analytics`.
   Su provider tiene `analytics ?? true`: venía encendido por defecto. La
   protección es un `if` alrededor de un `fetch`, así que apagarlo no puede
   afectar la conexión de wallet. **RESUELTO**: `analytics={false}`.

2. **El SDK de wallet de Coinbase** inyecta su propio script de telemetría e
   inicializa Amplitude contra `https://cca-lite.coinbase.com`, identificando un
   `deviceId` persistente **en la carga de página, antes de conectar ningún
   wallet**. Lo controla `preference.telemetry !== false`, pero OnchainKit le
   pasa a su conector `preference: 'all'` como string, así que no hay dónde
   poner el flag sin montar nuestro propio `wagmi` config y envolver en
   `WagmiProvider`. **PENDIENTE**, y a propósito: ese cambio toca el modal de
   conexión (rabby/trust/frame, MiniKit) y **no se puede verificar sin conectar
   un wallet de verdad**. No se despliega a ciegas.

Para una app cuya posición de privacidad es que hashea la dirección antes de
guardarla, que un tercero reciba un identificador persistente del navegador en
cada carga es una contradicción. Vale la pena cerrarla; vale más cerrarla
probada.

**`upgrade-insecure-requests`**: el navegador avisó que se ignora en una política
report-only. Movida a la mitad aplicada, donde no prohíbe nada que hoy funcione.

### Evidencia recogida · 14 sep 2026

Recorridas seis pantallas con la política puesta — inicio, Holdings, Earn,
Pools, Ask, Simulate, Explore — leyendo lo que el navegador reportó. Esto es lo
que la app necesita **de verdad**, observado, no supuesto:

| directiva | qué hay que añadir | quién lo pide |
|---|---|---|
| `img-src` | `https://token-icons.llamao.fi` | logos de tokens (196 violaciones, con diferencia lo más frecuente) |
| `connect-src` | `https://api.developer.coinbase.com` | OnchainKit, RPC de Base |
| `connect-src` | `https://ethereum.reth.rs` | wagmi contra mainnet, probablemente ENS |
| `connect-src` | `https://cca-lite.coinbase.com` | telemetría del wallet SDK (ver arriba) |
| `script-src` | un **nonce** | hidratación de Next.js |

Y lo que **no** hace falta tocar, que es la mitad del valor de haber medido:
`style-src` (el `'unsafe-inline'` que ya lleva es suficiente), `font-src`,
`frame-src`, `worker-src` y `default-src` no reportaron nada en ninguna
pantalla.

**Los hashes no sirven para `script-src`.** El navegador ofrece un `sha256-…`
por cada script inline, pero los valores **cambian de página a página** — parte
son del bootstrap del framework y se repiten, y parte son del payload RSC de
cada ruta. Una lista de hashes habría que regenerarla en cada build y en cada
ruta nueva, y el día que alguien la olvide la página se queda en blanco. Tiene
que ser un nonce por request, lo que implica un `middleware.ts`.

**La mitad aplicada no bloquea nada.** Cero errores de consola en las seis
pantallas, y ninguna violación de `object-src`, `base-uri` ni `form-action`.

**Lo que esta pasada NO cubre**, y hay que medirlo antes de aplicar: el flujo de
conexión de wallet (abrir el modal, conectar de verdad) y la app dentro de Base
App. Ambos pueden pedir orígenes que aquí no aparecieron.

## 11. Cerrar `connect-src` y `default-src` (14 sep 2026)

Estas dos quedaron fuera en §10 por un motivo concreto: `default-src` es el
fallback de `connect-src`, así que aplicarla aplicaba también la otra, y la
lista de orígenes que salía de recorrer pantallas estaba **incompleta sin
saberlo**. Cerrarla ahí habría roto conectar wallet para todo el mundo, y nos
habríamos enterado por un usuario que no puede entrar.

**Lo que faltaba, y cómo apareció.** Recorrer seis pantallas dio tres orígenes.
**Conectar un wallet de verdad dio un cuarto**, `https://api.coinbase.com`, seis
violaciones, que ninguna cantidad de navegar habría revelado. Dos más salen de
leer las constantes del propio SDK en vez de esperar a que nos sorprendan:
`https://keys.coinbase.com` y `https://rpc.wallet.coinbase.com`, alcanzables en
flujos que nadie ejercitó aquí.

| origen | de dónde salió |
|---|---|
| `https://api.developer.coinbase.com` | reportado navegando (OnchainKit, RPC de Base) |
| `https://ethereum.reth.rs` | reportado navegando (wagmi contra mainnet, ENS) |
| `https://api.coinbase.com` | **reportado solo al conectar un wallet** |
| `https://keys.coinbase.com` | constantes del SDK de wallet |
| `https://rpc.wallet.coinbase.com` | constantes del SDK de wallet |

**Lo que quedó fuera a propósito es el punto de todo esto.**
`https://cca-lite.coinbase.com`, el endpoint de Amplitude al que reporta el SDK
de wallet (§10, punto 2), **no está en la lista**. El navegador es la única
palanca que tenemos, porque el flag `preference.telemetry` es inalcanzable
detrás del conector de OnchainKit. Y que bloquearlo sea seguro **no es una
esperanza**: el ad blocker de Alberto ya lo estaba bloqueando durante la prueba
— `ERR_BLOCKED_BY_CLIENT` — y el SDK se tragó el fallo (*"Analytics SDK:
TypeError: Failed to fetch"*) con la app funcionando normal todo el rato. Esto
convierte la divulgación de PRIVACY.md en algo que además se cumple.

**Lo que hay que verificar después del deploy**, porque medir en local no lo
sustituye: conectar un wallet otra vez con la política aplicada, y abrir la app
dentro de Base App. Si algo revienta, aparece en consola como violación de
`connect-src` con el origen exacto que falta, y añadirlo es una línea.

**Qué lo vigila**: `test/cspReport.test.mjs` (14 tests) comprueba que cada uno
de esos cinco orígenes sigue en la política — quitar uno rompe un flujo real —
y que `cca-lite.coinbase.com` sigue **fuera**, para que nadie lo añada más
adelante "para que no salga el error en consola".
