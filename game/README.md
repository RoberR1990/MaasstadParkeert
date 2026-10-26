# Maasstad Parkeert – stijlproef (3D diorama)

Vite + TypeScript + three + postprocessing. Alle geometrie en geluid zijn procedureel (geen assets).

- `npm install && npm run dev` – ontwikkelen
- `npm run build && npm run preview` – productiebuild op http://127.0.0.1:4173
- `node tools/shots.mjs [naam…]` – schermafbeeldingen naar `screenshots/` (Playwright, software-GL)
- URL-parameters: `play=1` (titel overslaan), `skiptut=1`, `tutorial=1`, `hour=17.7`, `rain=1`, `pressure=80`, `pause=1`, `fps=1`, `dist=180`
- Hook voor tests: `window.__game` (setHour, setRain, setPressure, select, hoverLot, placeAt, advance …)
