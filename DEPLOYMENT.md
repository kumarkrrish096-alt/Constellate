# Free-Tier Deployment

This setup uses Vercel for the Vite frontend, Render for the API and queue worker, and MongoDB Atlas for persistence. The API and worker share one Render free web service because a separate always-on worker is generally not available on the free tier. Render may sleep when idle, so the first request can be slow and queued work pauses while the service sleeps.

## 1. Create the database

Create a MongoDB Atlas cluster and database user. Set the Atlas connection string as `MONGODB_URI` in Render. Keep it private and URL-encode special characters in the password. If Atlas requires broad network access because the host's outbound IP changes, allow `0.0.0.0/0` and use a strong, least-privilege database user.

## 2. Deploy the API and worker

Connect the repository to Render and create a Blueprint from `render.yaml`. The service starts the API and worker with `backend/deploy/start.js`. After deployment, note the Render service URL, for example `https://constellate-api.onrender.com`.

Set these Render environment values:

- `MONGODB_URI`: Atlas connection string.
- `FRONTEND_URL`: exact deployed Vercel origin, without a trailing slash.
- `BACKEND_URL`: exact Render service URL, without a trailing slash.
- `GITHUB_TOKEN`: optional; increases GitHub API access limits.
- `GEMINI_API_KEY`: optional; required for AI explanations.
- OAuth client IDs/secrets: optional. Register callback URLs as `BACKEND_URL/api/auth/google/callback` and `BACKEND_URL/api/auth/github/callback` with the providers.

Keep the generated `JWT_SECRET`. `COOKIE_SAMESITE=none` is configured because the frontend and API are on separate domains; both must use HTTPS. For OAuth, register the Vercel origin and production callback URLs with each provider.

## 3. Deploy the frontend

Import the repository into Vercel and set the project root to `frontend`. Use `npm run build` as the build command and `dist` as the output directory. Set this build environment variable to your Render URL:

```text
VITE_API_URL=https://constellate-api.onrender.com
```

Deploy the frontend, then set the exact Vercel production origin in Render's `FRONTEND_URL`. Redeploy the Render service after changing environment values. `frontend/vercel.json` sends client-side routes back to the SPA entry point.

## Free-tier limits

This setup is suited to demos and light use, not guaranteed always-on production. Render may sleep, free services have limited memory and CPU, and the worker shares those resources with the API. Large repository analyses may fail under those limits. Provider quotas and free-plan eligibility can change, so confirm current limits in the provider dashboards. The checked-in configuration does not require paid add-ons.
