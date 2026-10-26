# Maasstad Parkeert: speelbare ronde "Jaar 1" (fase 4, stap A)

Vite + TypeScript + three + postprocessing. Alle geometrie en geluid zijn procedureel (geen assets).
De spelregels komen uit de pure simulatie in `../src/sim` (alias `@sim`) en `../data` (alias `@data`):
dezelfde code als de bots (`npm run jaar1` in de repo-root).

## Spelen
Vier kwartalen (±5 minuten): **plannen** (klok staat stil: bouwen, aannemen, tarieven) → **Volgend kwartaal** →
**spelen** (±20 s, auto's en "?"-bellen volgen de sim; "Sla over" mag) → **afrekening** → … → **eindscherm** (krantenkop, sterren, 3 lessen).
Doel: Rotterdammert ≥ 70, fonds ≥ 0, Marathon (kwartaal 4) zonder chaos.

## Commando's
- `npm install && npm run dev` – ontwikkelen
- `npm run build && npm run preview` – productiebuild op http://127.0.0.1:4173
- `npm run build:single` – één bestand: `dist-single/index.html`
- `python3 tools/playthrough.py [uitmap] [url] [desktop|mobiel]` – volledige speelronde met echte klikken, schermafbeeldingen per stap (Playwright, software-GL; één browser tegelijk)
- URL-parameters: `q=low|med|high` (low = geen schaduw/post, pixelratio 1; zonder parameter kiest het spel zelf), `play=1` (titel overslaan), `skiptut=1`, `tutorial=1`, `hour=`, `rain=1`, `fps=1`, `dist=`, `debug=1` (druk-schuif voor de auto's), `event=wedstrijd|gorilla` (Bokito en wedstrijddag staan nog in de code, de knop is verborgen)
- Test-hook: `window.__game` (ready, phase, session, advance, lotXY, wijkXY, camera …)

## Opbouw
- `src/session.ts` – spelsessie rond de sim: plan, preview, commit, eindscore
- `src/copy.ts` – alle Nederlandse speltekst die van de sim afhangt (oorzaken, reacties, lessen, krantenkop)
- `src/ui.ts` – doelbalk, plankaart, Beleid/Team, afrekening, eindscherm
- `src/main.ts` – fases, 3D-wereld, bouwplekken, camera
- `src/cars.ts` / `src/patrol.ts` – auto's per wijk gedreven door bezetting/zoektijd uit de sim; scanauto's
- `src/wijken.ts` – de vier wijken op het diorama
