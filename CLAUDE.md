# Maasstad Parkeert

Serious game (SimCity-stijl) voor collega's Parkeren/Stadsbeheer, Gemeente Rotterdam. Spec: `docs/ONTWERP.md` — leidend.

## Werkafspraken
- Gefaseerd met reviewmoment per fase; niet doorbouwen naar de volgende fase zonder akkoord van Robert.
- Bij een blokkade of spec-gat: stoppen en voorleggen, niet aannemen.
- Zwaar uitvoerend werk (assets, UI-bouw, boilerplate) naar subagents met lichtere modellen; zware modellen alleen voor balans/ontwerpoordeel.
- Alle getallen in `data/config.json`, nooit hardcoded in code.
- `src/sim/` blijft puur en deterministisch (seeded RNG, geen Phaser/DOM). Game én bots gebruiken dezelfde code.
- Code en comments Engels, speltekst Nederlands.
- Easter eggs = badges, nooit punten. Geen echte logo's, clubnamen, songteksten of nagetekende kunstwerken.

## Fasen
1. Ontwerp + eerste rekenmodel — `docs/`, `data/`, `src/sim/`, `tools/` ← **nu**
2. Balans: bots, geen dominante truc; "alleen bouwen" moet verliezen
3. Grijze-blokjes-prototype in Phaser 3 (isometrisch), playtest 15 min
4. Mooi maken: Kenney-tegels als start, huisstijl, geluid, eggs, nabespreking
5. Scorebord (bijnaam + afdeling, scheldwoordfilter, weekscenario met vaste seed) + hosting

## Commando's
- `npm install`
- `npx tsx tools/run.ts` — draait 4 bots × 20 seeds, schrijft `tools/out/`
- `npm test`
