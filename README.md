# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```

## Push to GitHub and publish

1. Create a new GitHub repository.
2. In the project folder, run:

```sh
git init -b main
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

3. In GitHub, enable GitHub Pages for the repository and select the GitHub Actions deployment source.
4. The workflow in `.github/workflows/deploy.yml` will build and publish the site automatically on each push to `main`.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Multiplayer server

The realtime game runs on a standalone Node WebSocket server in `server/`
(rooms live in RAM only, no database).

```bash
cd server && npm install && npm start   # ws://localhost:8787/ws
```

Point the web app at a deployed instance with `VITE_WS_URL=wss://your-host/ws`.
Without it the app connects to `ws://<current-host>:8787/ws`.
See `server/README.md` for deployment and environment variables.
