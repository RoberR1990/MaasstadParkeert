# Maasstad Parkeert

Serious game (SimCity-stijl, 3D low-poly miniatuurstad) voor collega's Parkeren/Stadsbeheer, Gemeente Rotterdam. Spec: `docs/ONTWERP.md` — leidend. Balansstand: `docs/BALANS.md`.

## Werkafspraken
- Gefaseerd met reviewmoment per fase; niet doorbouwen naar de volgende fase zonder akkoord van Robert.
- Bij een blokkade of spec-gat: stoppen en voorleggen, niet aannemen.
- Zwaar uitvoerend werk (assets, UI-bouw, boilerplate) naar subagents met lichtere modellen; zware modellen alleen voor balans/ontwerpoordeel.
- Alle getallen in `data/config.json`, nooit hardcoded in code.
- `src/sim/` blijft puur en deterministisch (seeded RNG, geen Three.js/DOM). Game én bots gebruiken dezelfde code.
- Na elke wijziging in `src/sim/` of `data/`: `npm run sim` en check dat de doelen in `docs/BALANS.md` nog gehaald worden.
- Visuele lat: professioneel indiespel. Elke visuele wijziging verifiëren met Playwright-screenshots en kritisch bekijken.
- Code en comments Engels, speltekst Nederlands.
- Easter eggs = badges, nooit punten. Geen echte logo's, clubnamen, songteksten of nagetekende kunstwerken.

## Fasen
1. Ontwerp + eerste rekenmodel — klaar
2. Balans: 7 bots, geen dominante truc, "alleen bouwen" verliest — klaar (branch `fase-2-balans`)
3. Stijlproef één wijk (Three.js, dag/nacht, regen, zoekende auto's, tutorial, geluid) — `prototype/stijlproef/` ← **nu**
4. Volledige game: hele stad, sim gekoppeld, alle knoppen, kaarten, eggs, nabespreking
5. Scorebord (bijnaam + afdeling, scheldwoordfilter, weekscenario met vaste seed; externe DB toegestaan) + hosting

## Commando's
- `npm install`
- `npm run sim` — 7 bots × 20 seeds, schrijft `tools/out/`; `--set=pad=waarde` om een knop te testen
- `npm test`
