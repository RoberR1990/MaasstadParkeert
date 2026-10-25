# Balans fase 2

Alle cijfers: gemiddelde over seeds 1..20, `npm run sim`. Alle getallen zijn fictief.

## Resultaten (7 bots)

| bot | score | blij | fonds eind (M€) | afgeroomd totaal (M€) | straffen % van basis | achterstand eind |
|---|---|---|---|---|---|---|
| nietsdoen | 5008 | 52,6 | -0,6 | 55 | 5 | 31,7 |
| bouwwoede | 4022 | 48,9 | -1,0 | 17 | 18 | 134,0 |
| beheerder | 7827 | 78,3 | 4,9 | 9 | 0 | 0 |
| ov-first | 7840 | 78,4 | 4,5 | 19 | 0 | 0 |
| handhaver | 5829 | 58,3 | 5,0 | 355 | 0 | 0 |
| fietser | 6927 | 69,3 | 1,4 | 19 | 0 | 0 |
| random | 3100 | 44,8 | -20,6 | 33 | 31 | 87,3 |

Beheerder en ov-first zijn twee even sterke stijlen (verschil 0,2%). De afgewezen aankopen van beheerder (guard, 20 seeds samen): stalling 492x, nietjes 198x, scanauto 12x, steeds door te weinig cash.

## Blij per kwartaal: bouwwoede vs nietsdoen

| kwartaal | 4 | 8 | 12 | 16 | 20 | 28 | 40 |
|---|---|---|---|---|---|---|---|
| bouwwoede | 73,9 | 75,2 | 67,2 | 60,4 | 45,0 | 35,8 | 21,0 |
| nietsdoen | 76,5 | 72,8 | 65,2 | 60,2 | 52,6 | 47,8 | 23,0 |

Gemiddeld q4-12: bouwwoede 71,7 tegen nietsdoen 69,5 (eerst feest). Vanaf q16 gelijk, vanaf q20 eronder, einde laagst van alle bots behalve random-seeds die gemiddeld 24,3 halen (random q40 is ook laag; bouwwoede 21,0 is het laagst).

## Doelen

1. Geld bindt: gehaald. Geen bot eindigt boven 5 M€. Let op: de onderuitputting gebeurt bij jaarafsluiting (ook na kwartaal 40), dus dat eindsaldo is deels per constructie; het echte bewijs is dat beheerder maar 9 M€ afroomt en echte afwegingen maakt.
2. Niets doen doet pijn: gehaald. nietsdoen 52,6 (max 55), beheerder 78,3 (min 78), score-gat 2819 (min 2500). Dit komt vooral uit groei, plus vergrijzing van personeel (zie knoppen).
3. Eerst feest: gehaald (zie tabel). Let op: dit werkt alleen met een hoger startsaldo; zonder kan bouwwoede pas na q4 bouwen.
4. Straffen: gehaald, max 31% (random), bouwwoede 18%.
5. Geen dominante truc: gehaald. handhaver 5829 en fietser 6927 blijven onder beheerder (7827); random 3100 zit onder nietsdoen. ov-first is 0,2% hoger dan beheerder, dus niet "geen enkele bot erboven" voor die twee, maar dat zijn de twee bedoelde stijlen.

## Knoppen (oud -> nieuw)

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

- Dit is een scenario (week 1) en 20 seeds; ruis zit alleen in vraag, dus spreiding is klein. Andere weekscenario's moeten opnieuw gemeten worden.
- Beheerder haalt 78,3 met weinig marge (grens 78); nietsdoen kan bij elke aanpassing aan de rand van 55 komen.
- nietsdoen stort in het laatste jaar in (q40 = 23) door sluitingen; dat is hard maar bedoeld.
- handhaver verdient enorm (355 M€ weggeroomd) en spendeert dat niet; in het echte spel is dat een punt voor de nabespreking (inkomsten naar algemene middelen).
- Fietsvoorzieningen zijn relatief goedkoop voor hun blij-gewicht (22% totaal); fietser haalt 69 met alleen fiets. Ondergrens-aanpassing kan via `nietjes.maxRacksPerWijk`.
- De wijzigingen aan ONTWERP.md (straffen, startsaldo, onderuitputting, netheid-vertraging) moeten nog worden overgenomen door de eigenaar van dat document.
