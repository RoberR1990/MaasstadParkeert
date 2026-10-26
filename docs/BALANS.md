# Balans fase 2

Alle cijfers: gemiddelde over seeds 1..20, `npm run sim` (week 1) en `npm run sim -- --scenario=week2`. Alle getallen zijn fictief. Omzet = totale parkeeropbrengst per jaar (M€) in jaar 1 / 5 / 10.

## Resultaten week 1 (8 bots)

| bot | score | blij | fonds eind (M€) | afgeroomd totaal (M€) | omzet j1/5/10 (M€) | straffen % van basis | achterstand eind |
|---|---|---|---|---|---|---|---|
| nietsdoen | 4901 | 52,9 | -8,3 | 31 | 10/10/8 | 7 | 44,6 |
| bouwwoede | 4019 | 49,8 | -8,6 | 8 | 11/12/10 | 19 | 132,9 |
| beheerder | 7814 | 78,1 | 3,0 | 1 | 11/20/23 | 0 | 0 |
| ov-first | 6431 | 65,9 | -4,2 | 20 | 10/12/14 | 2 | 0 |
| handhaver | 6480 | 64,8 | 5,0 | 57 | 15/18/19 | 0 | 0 |
| fietser | 6793 | 70,3 | -8,9 | 14 | 10/11/11 | 3 | 0 |
| random | 3376 | 47,8 | -31,9 | 21 | 11/12/12 | 29 | 96,8 |
| handhaver-beheerder | 7314 | 73,1 | 2,7 | 2 | 10/16/18 | 0 | 0 |

## Resultaten week 2 (8 bots)

Week 2: andere groeivolgorde (Bergkade en Ommeland eerst, Merwehaven pas vanaf kwartaal 10, Plaswijk en Kuipwijk gewisseld, Oud-West en Noord gewisseld), wedstrijddagen in kwartaal 3, 7, 11..., bezuiniging in kwartaal 20 i.p.v. 24, app-parkeren in kwartaal 9.

| bot | score | blij | fonds eind (M€) | afgeroomd totaal (M€) | omzet j1/5/10 (M€) | straffen % van basis | achterstand eind |
|---|---|---|---|---|---|---|---|
| nietsdoen | 4919 | 53,5 | -9,2 | 30 | 10/11/8 | 8 | 44,6 |
| bouwwoede | 3990 | 50,0 | -10,2 | 7 | 10/12/10 | 20 | 132,9 |
| beheerder | 7840 | 78,4 | 2,9 | 1 | 12/20/22 | 0 | 0 |
| ov-first | 6408 | 66,6 | -7,5 | 20 | 10/11/12 | 4 | 0 |
| handhaver | 6510 | 65,1 | 5,0 | 54 | 15/18/19 | 0 | 0 |
| fietser | 6780 | 70,0 | -8,5 | 13 | 10/11/11 | 3 | 0 |
| random | 3389 | 48,2 | -33,4 | 21 | 10/12/12 | 30 | 96,5 |
| handhaver-beheerder | 6788 | 68,8 | -2,2 | 17 | 10/13/14 | 1 | 0 |

## Blij per kwartaal: bouwwoede vs nietsdoen (week 1 / week 2)

| kwartaal | 4 | 8 | 12 | 16 | 20 | 28 | 40 |
|---|---|---|---|---|---|---|---|
| bouwwoede w1 | 79,5 | 76,1 | 68,5 | 60,9 | 47,0 | 35,7 | 23,2 |
| nietsdoen w1 | 80,5 | 76,3 | 68,9 | 62,9 | 55,0 | 43,6 | 24,0 |
| bouwwoede w2 | 77,3 | 73,6 | 65,4 | 57,7 | 45,0 | 30,6 | 20,6 |
| nietsdoen w2 | 78,2 | 73,8 | 66,6 | 60,5 | 53,1 | 40,6 | 21,5 |

Gemiddeld q4-12: week 1 bouwwoede 74,7 tegen nietsdoen 74,6; week 2 74,1 tegen 74,2.

## Doelen

1. Geld bindt: gehaald (beide weken). Geen bot eindigt boven 5 M€ (onderuitputting bij jaarafsluiting).
2. Niets doen doet pijn: gehaald. Week 1 nietsdoen 52,9 (max 55), beheerder 78,1 (min 78), scoregat 2913 (min 2500). Week 2: 53,5 / 78,4 / 2921.
3. Eerst feest: **vrijwel verdwenen**. Week 1 +0,1 (was +2,2), week 2 -0,1. Dit is de enige oude doelstelling die niet meer met marge gehaald wordt, zie resterende punten.
4. Straffen: gehaald, max 29% (random week 1), 30% (week 2); bouwwoede 19-20%.
5. Geen dominante truc: gehaald. handhaver, fietser en ov-first blijven onder beheerder; random onder nietsdoen.
6. Nieuw: handhaver-beheerder <= beheerder + 3%: gehaald, -6,4% (week 1) en -13,4% (week 2).
7. Nieuw: handhaver afgeroomd < 60 M€: gehaald, 57 (week 1) en 54 (week 2). Was 355.
8. Nieuw: omzet voor een redelijke strategie 10-25 M€/jaar: gehaald (beheerder 11 -> 23, was 26 -> 56).

## Waarom handhaver-beheerder won (en nu niet meer)

Opbrengst van handhaving zat niet in de scanauto's (dekking boven 100% telde al niet mee), maar in drie dingen: (1) elke betaalde parkeerplek leverde 300 betaalde uur per kwartaal op, (2) hoog tarief verjoeg te weinig bezoekers, waardoor hoog meer opbrengt dan midden, en (3) hoog tarief maakte de straat leeg, dus beter zoeken voor iedereen, zonder prijs in tevredenheid. Het combineren met goed beheer gaf +0,5% en 90 M€ afgeroomd. Nu is hoog een dure noodgreep: minder opbrengst dan midden, strengere boetes, ontevreden ondernemers en bezoekers en een wethouder die graaitarieven afstraft.

## Knoppen (oud -> nieuw), deze ronde

Model (src/sim):
- `scanEff` rekent nu met handhavers per scanauto (`staff.handhaver / scanauto.staff.handhaver`); bij 1 FTE per auto geen verschil.
- `model.tariffFineMult` nieuw: boetes wegen mee naar tarief (laag 1, midden 1,2, hoog 1,8), zodat bezwaren en klantcontact meeschalen met duur tarief.
- `score.graaiMax` / `graaiFree` nieuw: wethouder trekt tot 30 punten af als meer dan 30% van de betaalde straatplekken op hoog staat (lineair tot 100%).
- `score.bezoekerParts.tariff` nieuw: bezoekers wegen het tarief mee (zoeken 0,5 -> 0,4, storing 0,25 -> 0,2, garage 0,25, tarief 0,15). Zonder dit werd weggejaagd worden beloond.

Config:
- `model.paidHoursPerSpotQuarter` 300 -> 100: opbrengst per betaalde plek terug naar realistische orde (circa een uur per dag betaald).
- `policy.tariffEur.hoog` 6 -> 5 en `policy.tariffDemand.hoog` 0,7 -> 0,3: hoog levert per bezoeker minder op dan midden (1,5 tegen 3,4 euro-eenheden); dit is de belangrijkste rem op het geldmachine-effect.
- `finance.fixedOverheadPerYear` 33 -> 24 M€: gevolg van de lagere opbrengst, anders was iedereen failliet. `finance.startFonds` 30 -> 28 M€.
- `assets.garage.capex` 12 -> 9 M€ en `assets.stalling.capex` 3 -> 2,5 M€: met een kleinere pot moet beheerder nog steeds kunnen bouwen. Wat een bot die niets uitgeeft afroomt, is ongeveer wat beheerder wel uitgeeft; goedkopere bouw maakt dat gat kleiner.
- `staff.attritionPerQuarter` 0,014 -> 0,019: nietsdoen moest weer onder 55 komen, nu het centrum met hoog tarief rustiger is.
- `start.wijken.centrum.visitors` 4800 -> 6000: zelfde reden, het centrum begint met hoog tarief.
- `score.negFondsPenaltyPerQuarter` 60 -> 40: random en nietsdoen kregen anders te grote straffen door de krappere kas.
- `score.tariffSat.hoog` 45 (ongewijzigd), maar telt nu ook voor bezoekers.

Bots / tools:
- Nieuw: `handhaver-beheerder` (beheerder plus hoog tarief overal plus scanauto's tot 105% dekking).
- `run.ts`: `--scenario=week2`, `--patch=bestand.json` (config deep-merge voor experimenten) en kolom omzet j1/5/10; week 2 schrijft naar `tools/out/week2/`.
- Nieuw scenario `data/scenario-week2.json`.
- Tests: dekking boven 100% geeft geen extra naleving of opbrengst, omzet jaar 1 tussen 8 en 25 M€, hoog levert minder op dan midden, handhaver-beheerder niet meer dan 3% boven beheerder.

Eerdere knoppen (ronde 1) staan nog steeds:

Model (src/sim):
- `finance.reserveCap` nieuw, 5 M€: onderuitputting, saldo boven de cap vloeit bij jaarafsluiting weg (stat `afgeroomd`).
- `model.netheidSpeed` nieuw, 0,25: netheid reageert geleidelijk op schoonmaakratio (was direct); de rekening van onderbezetting komt zo later.

Config:
- `finance.yearBudget` 25 -> 18 M€ en `fixedOverheadPerYear` 31 -> 33 M€: minder structurele ruimte.
- `finance.startFonds` 10 -> 30 M€: eerste jaar kan er echt gebouwd worden.
- `score.fondsHappy` 10 -> 1 M€: wethouder is tevreden zodra het saldo niet negatief is.
- `score.introPenaltyBewoner` 8 -> 5, `introPenaltyWethouder` 6 -> 4: invoeren betaald parkeren was te zwaar.
- Straffen: `backlogPenaltyPerPoint` 50 -> 6, `negFondsPenaltyPerQuarter` 500 -> 60 (de waarden in ONTWERP.md paragraaf 7 zijn dus achterhaald).
- `staff.attritionPerQuarter` 0,008 -> 0,014 en `model.maintenance.closeAt` 8 -> 6: zonder werven vergrijst het team en sluiten garages eerder.
- `start.wijken`: hogere druk (centrum bezoekers 3400 -> 4800, kopbrug 900 -> 1700, kuipwijk 900 -> 1500, pleinzuid bezoekers 1900 -> 2400 en autobezit 0,35 -> 0,38, oudwest 0,225 -> 0,25, noord 0,235 -> 0,27, plaswijk 0,40 -> 0,44, kuipwijk 0,30 -> 0,32, rand 0,38 -> 0,42).
- `data/scenario-week1.json`: 14 extra torens in alle wijken, Merwehaven-torens ongewijzigd, wedstrijddag Kuipwijk elk 4e kwartaal x2,0, evenement centrum elk 4e kwartaal x1,25, autobezit +2% per 2 jaar.
- `bots.bikeShortTrigger` 0,2 -> 0,1 en `garageBezTrigger` 0,95 -> 0,9: beheerder bouwt eerder fietsvoorzieningen en garages.

Bots (tools/):
- Nieuw: handhaver, fietser, random (seeded op spelseed + kwartaal).
- beheerder voert betaald parkeren één wijk tegelijk in; bouwwoede houdt alleen kasgeld over voor het lopende tekort tot de volgende begroting.
- ov-first voert ook betaald parkeren in (zonder prijsprikkel heeft P+R geen zin en was er geen inkomsten, dus structureel negatief saldo).
- Guard logt afwijzingen (`guardLog`); `run.ts` kent `--set=pad=waarde` en print blij per kwartaal.

## Resterende punten

- Dun: beheerder 78,1 (week 1) en 78,4 (week 2) tegen een grens van 78. Elke aanpassing kan dit onder de grens duwen. Eerst feest ligt op +-0.
- Afhankelijkheid: de afgeroomd-grens voor handhaver en het halen van 78 door beheerder trekken in tegengestelde richting. Wat handhaver afroomt is ongeveer wat beheerder uitgeeft; meer overhead haalt handhaver onder 60 maar duwt beheerder onder 78. Gekozen: 57 / 78,1.
- ov-first is niet meer even sterk als beheerder: 65,9 tegen 78,1 (was 78,4). OV-betaling (2 M€ per wijk per jaar) past niet in de krappere kas. `ov.payPerYear` 2 -> 0,8 M€ zou ov-first naar circa 70 brengen; niet doorgevoerd omdat het OV-prijsgevoel verandert en niet gevraagd was.
- Eerst feest (bouwwoede boven nietsdoen in q4-12) is weg omdat hoog tarief in het centrum de druk al wegneemt. Meer druk in Kopbrug en Pleinzuid (bezoekers 2000/2800) geeft +0,5 maar kost beheerder 1 punt.
- Hoog tarief overal is nu een slechte strategie, maar centrum-hoog bij de start blijft sterk: in een proefronde met centrum-start op midden zakte beheerder naar circa 71. Bewust zo gelaten.
- handhaver is nu 64,8 blij (was 58,3): door het lage hoog-tarief-aanbod hebben bezoekers en bewoners weinig te klagen. Score blijft ver onder beheerder, omdat fiets (20) en wethouder (66) laag zijn.
- Week 2 is zacht getuned: dezelfde knoppen, geen aparte aanpassing. Beheerder en nietsdoen houden marge (78,4 / 53,5); de spreiding van handhaver-beheerder is in week 2 groot (min 6103, max 7230).
- De wijzigingen aan ONTWERP.md (straffen, startsaldo, onderuitputting, netheid-vertraging, opbrengst, tarieven) moeten nog worden overgenomen door de eigenaar van dat document.
