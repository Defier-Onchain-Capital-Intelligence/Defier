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
- `npm audit` antes de cada release. Fijar versiones (no `latest` en `package.json` una vez instaladas: reemplazar por la versión exacta que instaló npm).
- Instalar solo paquetes conocidos (OnchainKit, wagmi, viem, ethers, recharts, Anthropic SDK, Supabase). Nada de paquetes de "wallet connect" de terceros desconocidos.

## 7. Producto
- La app es de solo lectura: nunca pide firmas, nunca pide seed phrases, nunca construye transacciones. Decirlo en la UI.
- Disclaimers: informational only; tokenized stocks only in eligible jurisdictions outside the US.
