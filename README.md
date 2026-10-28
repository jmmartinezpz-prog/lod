# 🎲 LOD · Road to Napicol 2027

App de la liga de dados: clasificación en directo, historial de jornadas, sanciones, piscinas y puntos de historia.

Stack: Next.js + Supabase + Vercel.

## Puesta en marcha

1. **Supabase → SQL Editor**: ejecuta `supabase/01_schema.sql` y después `supabase/02_seed.sql`.
2. **Supabase → Authentication → Users → Add user**: crea tu usuario admin (email + contraseña).
3. **Supabase → Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*.
4. Copia `.env.example` como `.env.local` y rellena URL y anon key.
5. `npm install` y `npm run dev` → http://localhost:3000

## Despliegue

Vercel → Add New Project → importar este repo → añadir las dos variables `NEXT_PUBLIC_SUPABASE_*` → Deploy.

## Puntuación

| Jugadores | Normal | Sobrantes |
|---|---|---|
| 5 | 5-3-2-1-0 | 9-6-4-2-0 |
| 4 | 4-2-1-0 | 7-4-2-0 |

Con otro nº de jugadores los puntos se ponen a mano. Las jornadas J1–J35 están como "arrastre".
