# Deployment

This project is split into:

- Vite frontend on Vercel
- WebSocket relay backend on Render

The relay is ephemeral. It keeps room state only in memory and does not persist user data.

## Local Development

1. Install dependencies with `pnpm install`.
2. Start the frontend with `pnpm dev`.
3. Start the relay server with `pnpm run server`.

The frontend uses `VITE_WS_URL` when it is set. If it is not set, it falls back to `ws://localhost:3001`.

## Required Environment Variables

Frontend:

- `VITE_WS_URL` - WebSocket base URL for the room relay, for example `wss://your-render-service.onrender.com`

Backend:

- `PORT` - port to listen on, usually set by Render
- `ALLOWED_ORIGINS` - comma-separated list of allowed browser origins

Example:

```bash
ALLOWED_ORIGINS=http://localhost:5173,https://arhawk.github.io,https://your-vercel-app.vercel.app
```

## Render Backend Settings

Create a new Web Service from the repo root with:

- Build command: `pnpm install --frozen-lockfile`
- Start command: `pnpm run server`
- Port: use the platform-provided `PORT`

Set these environment variables on Render:

- `ALLOWED_ORIGINS` with your local dev origin and deployed frontend origin(s)

Verify the service with:

- `GET /health` -> `{"status":"ok"}`

## Vercel Frontend Settings

Deploy the repository root as the frontend app.

Set this environment variable in Vercel:

- `VITE_WS_URL` = `wss://your-render-service.onrender.com`

If you deploy the frontend to a different domain later, update `ALLOWED_ORIGINS` on Render so the backend accepts that origin.

## Health Check

Test the backend directly after deployment:

```bash
curl https://your-render-service.onrender.com/health
```

Expected response:

```json
{ "status": "ok" }
```

## Notes

- The relay uses in-memory room state only.
- Restarting the backend clears all rooms, viewers, host tokens, and other transient state.
- There is no database in this deployment setup.
