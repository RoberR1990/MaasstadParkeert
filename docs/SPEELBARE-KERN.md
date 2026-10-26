# Speelbare kern — "Jaar 1" (eisen v0.1)

Basis: feedback Robert (26-10) + 4 persona-playtests (Fatima/handhaver, Kevin/monteur, Marja/MT, Joost/data-gamer) op stijlproef r2.
Doel van deze stap: van stijlproef naar een **speelbare ronde van ±5 minuten met begin, doel en eind**, waarin oorzaak → gevolg → keten zichtbaar is. Desktop eerst, telefoon tweede.

## Wat de tests unaniem zeiden
| bevinding | wie |
|---|---|
| Geen doel, geen einde, geen winst/verlies | allen + Robert |
| Effect van een keuze niet te zien; score beweegt "vanzelf" | allen |
| Geld voelt onbeperkt; geen inkomsten | Robert, Joost |
| Bouwen onhandig: pijltje niet klikbaar, "kavel/kwart kavel/Esc" jargon, geen annuleren op touch | Fatima, Joost, Marja |
| Eigen werk/ketens/collega's niet terug te zien | Fatima, Marja |
| Rotterdam herkenbaar, sfeer en looks goed | allen |

## Spelverloop Jaar 1

```
Intro (15 s): Ria + Sap schetsen het probleem en het doel
 ┌─ Kwartaal ×4 ─────────────────────────────────────────────┐
 │ 1. PLANNEN (klok staat stil)                               │
 │    heatmap parkeerdruk per wijk, wijkpaneel, bouwen,       │
 │    beleid, personeel — elk met VOORSPELLING vóór bevestigen │
 │ 2. SPELEN (±20 s, versneld): stad leeft, auto's zoeken,    │
 │    gebeurtenis/Moment speelt af                             │
 │ 3. AFREKENING: inkomsten − uitgaven, KPI's oud→nieuw,      │
 │    "waarom" (top-3 oorzaken), kettingreactie langs teams,  │
 │    reacties van Rotterdammerts                              │
 └────────────────────────────────────────────────────────────┘
Eindscherm: krantenkop, score, 3 lessen ("jij bouwde X maar…")
```
Geen wachten: de speler drukt zelf op **"Volgend kwartaal"**. Dat lost "tempo te langzaam" op. Tijdsbudget: ±5 min totaal (per kwartaal ±40 s plannen, 20 s spelen, 15 s afrekening).

## Doel en startprobleem
- **Start:** Blaak/Centrum staat rood (zoektijd ±12 min), Rotterdammert 52 "Chagrijnig". In Q2 komen nieuwe torens op de Kop van Zuid. In Q4 is de **Marathon**.
- **Doel (altijd zichtbaar bovenin):** "Rotterdammert ≥ 70 aan het eind van het jaar · fonds niet onder nul · Marathon zonder chaos."
- **Sterren:** 1★ doel gehaald, 2★ met ≥ 3 M€ over, 3★ geen enkel team in het rood.

## Geld (uit het echte rekenmodel `src/sim`)
- Startfonds krap (orde 25 M€). Een garage van 9 M€ is een echte keuze.
- **Inkomsten zichtbaar** per kwartaal: straatparkeren, garages, vergunningen. Ze reageren op tarief, naleving (handhaving) en storingen.
- Beheerkosten en personeel lopen elk kwartaal door. De fondsweergave rekent in k€ (een automaat van 15 k€ moet je zien).

## Kaart en bouwen
- **4 wijken in beeld:** Centrum (Coolsingel/Blaak/Hofplein/CS), Kop van Zuid & Noordereiland, Feijenoord & De Kuip, Noord & Blijdorp. Stad iets groter, met meer bouwplekken per wijk (Robert: "te krap").
- **Heatmap-laag** voor parkeerdruk/zoektijd per wijk (aan in de planfase). Klik op een wijk → **wijkpaneel**: bezetting, zoektijd, inkomsten, klachten, betaald ja/nee.
- **Bouwlijst** (met naam en prijs, ook op de telefoon): Garage · Betaalautomaat · **Scanauto** · Fietsenstalling · P+R (alleen rand).
- **Voorspelling bij hover/selectie:** "Garage hier: zoektijd Blaak 12 → 8 min · −9 M€ nu · −0,25 M€/jr · vraagt 0,5 schoonmaker + 0,3 monteur".
- **Hele bouwplek klikbaar** en gloeiend omrand. Gewone taal: "bouwplek". Een zichtbare **Annuleer**-knop. Tik je ernaast, dan zegt het spel waarom het niet gaat.

## Teams en ketens (serieuze laag, ONTWERP §13)
- **Teambalk:** Handhaving · Backoffice & Bezwaar · Techniek · Schoonmaak & Garagebeheer · Klantcontact, elk met een **werkdrukmeter** (groen/oranje/rood) en een personage. Klik op een team → personeel aannemen (instroom na 1 kwartaal).
- In de afrekening speelt de **kettingreactie** van de belangrijkste keuze uit KETENS.md af (bijvoorbeeld K1 scanauto → backoffice → bezwaar → klantcontact).
- **Sap** geeft één keer per kwartaal advies als iets dreigt mis te gaan ("Twee garages en geen schoonmaker? Dat ruik je in Q3.").
- **Eén dilemma** per jaar (ONTWERP §13 #5), bijvoorbeeld een ondernemer die vraagt om gratis parkeren tijdens een verbouwing.

## Moment: Marathon (Q4)
De aankondiging komt in Q3. De partners besluiten eerst ("Coolsingel en Erasmusbrug dicht"). Daarna kies je wat Parkeren doet: extra handhaving / garagetarief evenement / pendel vanaf P+R / bewonersbrief. Het live-moment speelt in de speelfase, met het resultaat als krantenkop.

## Fixes uit de playtests (verplicht)
1. Tutorialtekst direct in beeld (geen typemachine). Kaart past binnen 360 px. Geen tooltip over Ria heen.
2. Na de tutorial altijd **één concrete eerste opdracht** met pijl.
3. Eén paneel tegelijk (evenementmenu en parkeerdrukpaneel overlappen niet). Labels nooit over de HUD.
4. De uitspraak van de Rotterdammert past bij de score. **Scoreverandering met oorzaak** in beeld ("Fietser +4: stalling bij Blaak").
5. De schuifbalk voor parkeerdruk verdwijnt; druk volgt uit het model. Een testschuif kan blijven achter `?debug=1`.
6. Laadtekst uit de DOM na het laden. Automatische lichte stand plus `?q=low`.
7. Pictogramknoppen rechtsonder krijgen een label of tooltip, ook op touch (lang indrukken).

## Bewust níet in Jaar 1
Volledige 10 jaar, scorebord, alle Momenten, alle 8 ketens, minigames per team (zie pitch MT), datamist (afgewezen).

## Testen
Na elke bouwstap: één persona tegelijk (niet parallel; 2 CPU's), met `?q=low`, met echte klikken en tikken, de volledige ronde tot het eindscherm. De vier personas blijven de vaste testset.
