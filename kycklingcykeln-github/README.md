# Kycklingcykeln

A Swedish browser game built around the chicken and bicycle created in this conversation.

## Play

- Left/right arrows, A/D, screen buttons or horizontal swipes steer between three lanes.
- Space, Arrow Up or the mobile jump button jumps. Upward swipes also jump. Black seeds reverse Up to Down and upward swipes to downward swipes for three seconds; Space remains unchanged.
- Crates and small rocks can be jumped. Rolling boulders begin after 1,000 m; a normal jump cannot clear them.
- Gentler normal speed: 1.3x at 0–499 m, 1.8x at 500–999 m, 2.3x at 1,000–1,499 m, then 2.4x at 1,500 m plus 0.1x every 300 m without a maximum. Boost and crash recovery modify the base speed temporarily.
- Every 1,500 m cycle has 1,000 m of daylight followed by 500 m of night: 1,000–1,500 m, 2,500–3,000 m, 4,000–4,500 m, and so on indefinitely. The sun sets, the moon rises, stars appear and the mounted bicycle headlight switches on each night. The first and last 40 m of each night animate twilight.
- Ride up a turquoise ramp to collect a five-seed airborne trail, with an automatic jump and a 1.65x boost lasting three seconds of active riding. The boost does not stack; when it expires, speed returns to the normal distance-based tier. Pausing, falling or waiting for sheep freezes the timer. Airborne seeds follow the actual ramp launch and are too high for ordinary jumps.
- The first two crashes freeze the world, animate a fall and recovery, and continue from the same distance with seeds retained. The third crash ends the ride.
- Personal best is distance in whole meters, stored in this browser using localStorage. A synthesized bicycle bell rings once per ride when an existing record is beaten. The first ride establishes the record. Storage and audio failures never block play.
- R or the on-screen Ring button sounds the synthesized bicycle bell. Occasional flocks span the road and stop the ride until the player rings; they cannot be jumped or dodged and never cost a life. Sheep walk to the roadside after the bell, then the ride resumes. The automatic record bell does not clear sheep.
- Some ground seed trails include one black seed. Collecting it awards no points and reverses left/right steering and vertical swipe gestures for three seconds of active riding; another black seed resets, rather than adds to, the timer. Space and R keep their normal actions.
- The supplied Alexander Kyckling MP3 loops during riding, crashes and sheep encounters. It starts with the ride, pauses with the game or hidden tab, stops at game over, and restarts from the beginning on a new ride. The music note menu provides an on/off switch and independent volume (35% initially); a separate Web Audio gain supports mobile volume without affecting the bell. Playback errors do not block the game.
- P or Escape pauses. Hiding the tab also pauses. Restart from the pause or game-over screen.

## Structure

- `dist/index.html`: game interface and local Three.js import map.
- `dist/style.css`: responsive daytime/nighttime styles.
- `dist/game.js`: world, model assembly, gameplay, weather, light and sound.
- `dist/assets/kyckling-cykel.glb`: original editable chicken and bicycle models.
- `dist/vendor`: vendored Three.js 0.160.0 and its MIT license.
- `.openai/hosting.json`: canonical Sites identity and static output configuration.

No backend or build is required. Serve `dist` through HTTP for local development.

## Checks

`node tests/gameplay.mjs` runs the real gameplay functions with Three.js and DOM/audio stand-ins. It covers boundary speeds, night and lamp intervals, sun/moon positions, ramp ascent and boost expiration, jump clearance, collision recovery, game over after three falls, highscore persistence and bell frequency, and keyboard controls. It does not render a browser preview.

## Progressive difficulty

Obstacle rows get gradually closer with distance, but spacing is now 18 + 16 / (1 + distance / 2200) meters, producing roughly 18–26% more rows than the previous tuning while retaining the gentler, uncapped speed curve. Double-obstacle chance rises from 14% toward 54%; double rows never occur consecutively. Ramp rows have no obstacle wave. Ordinary rows retain a free lane; sheep deliberately span all lanes and require the bell. Sheep appear intermittently with an open approach. After 1,000 m, boulders become a growing share of single hazards (24% plus 26% × distance / (distance + 3500)). After 1,500 m, approaching boulders still randomly choose a sudden speed increase or an adjacent-lane change after a short orange flash. Collision checks sweep both axes.

## Adventure expansion (v10)

- Rocket pickups appear on 20% of eligible ramp rows, starting at 250 m, with at least 700 m between rocket opportunities. Ride the ramp to collect one. Ordinary ramps retain their original three-second boost and five-seed trail.
- Rockets unfold the original model's wings and provide five seconds of flight, including smooth ascent and descent. A single trail contains 18 airborne seeds worth three points each (54 points). It either stays in the launch lane or hands over to one adjacent lane after nine seeds, with a 0.63-second gap for steering. Timed contact keeps the trail reachable across speed changes. Flight is 1.25× base speed, freezes on pause and finishes with a short protected landing. Sheep still require the bell; a blocking flock ends flight and waits for the bell.
- The original air-trick control was replaced by the single-use superboost in v12.
- Fork gates start around 600 m and recur after 1,100–1,450 m. Steer through the left gate for a calm route or right for an adventure route; the route buttons also select the lane. Center defaults to calm. Both variants last twelve active seconds. Calm routes space rows 35% farther apart and halve the double-obstacle probability. Adventure routes space them 15% closer, increase double-obstacle probability by 25%, and provide extra ramps and longer reward trails. Base progression remains unchanged.
- Occasional pickups offer an eight-second magnet (gold seeds only, within reach vertically, drawn to the chicken along a visible 0.48-second arc), a twelve-second bubble that absorbs one collision, or five seconds at 65% current speed. Powers refresh their own duration, coexist, and pause with gameplay. Sheep still require R.
- Earned seeds are also added once to an independent browser-local equipment bank. Cosmetic red/gold helmets and blue/pink bicycles cost 80/220 and 120/180 seeds respectively. Unlocked items can be equipped freely. Purchases do not subtract from the current run's score. Opening equipment pauses an active ride; closing restores its previous state. Purchases and colors survive restarts/reloads; storage failures are explained in the equipment panel.
- Automated checks cover prior gameplay plus five-second flight, reachable rewards at several speed tiers, rocket rarity/cooldown, keyboard reversal, power effects, route choice, and equipment transactions and pause behavior. No browser visual QA was requested or performed.

## Flight and feedback adjustments (v11)

- Flight has one sequential trail, never three parallel rows. In 55% of flights it changes to an adjacent lane after nine seeds. A 0.63-second handover gap keeps the switch reachable at all speed tiers.
- Contact with an uncleared sheep flock removes up to 50 currently-held seeds once per flock, clamps both score and the equipment bank at zero, and ejects that many bouncing seed visuals. Spilled seeds are not collectible. The ride waits for R as before and the encounter does not consume an ordinary crash. Ringing before contact avoids the penalty.
- Magnet pickup adds animated pink rings around the chicken. Nearby gold seeds visibly accelerate along an arc toward the chicken's actual world position and award points only when they arrive. Black seeds remain unaffected. Attraction already in progress finishes even if the magnet expires; pausing freezes it.
- After the third ordinary crash, a separate 3D results scene shows the original chicken standing without its bike, with a gauze bandage around the left knee, a crutch, and a helmet with fracture lines and a missing shell section. The equipped helmet color is retained. Final seed points and distance remain visible beside it on desktop and below it on mobile. The damaged mesh is isolated from the riding model, so a new ride begins intact.
- Checks cover sequential trail generation and actual lane-switch collection, sheep penalties and bouncing particles, timely bell avoidance, magnet travel and scoring, and the actual GLB recovery scene with isolated helmet damage. No browser visual QA was requested or performed.


## Poängtavla och superboost (v12)

- Topplista: skriv ett namn efter game over. Spelet fyller automatiskt i frön och meter från den avslutade rundan. Flest frön rankas först, sedan längst sträcka; högst 100 resultat. En runda kan bara registreras en gång. Resultaten sparas lokalt i webbläsaren, inte i en gemensam databas för olika enheter.
- Ringklocka: dubbeltryck med ett finger på spelplanen på mobil. R och Ring-knappen finns kvar. Svep, långtryck och tryck på menyer räknas inte som dubbeltryck.
- Slutskärmen speglar vald hjälm och visar den valda cykeln bredvid den stående kycklingen. Bandage, krycka och skadad hjälm finns kvar.
- Orange markering visar förra avslutade rundans slut; turkos markering visar längdrekordet vid starten av den aktuella rundan. Meter och avstånd kvar visas när markeringarna närmar sig. Båda sparas på samma enhet.
- Trick är borttaget. Boost-knappen eller B ger 4 aktiva sekunder med 4× fart, skydd mot hinder och får samt animerad magnet för gula frön i alla tre filer, även luftfrön. Svarta frön ger ingen omvänd styrning under boosten. En användning per ny runda; paus fryser tiden. Vanliga rampboostar är separata.

### Publicera denna uppdatering

GitHub-repot använder `main` och publicerar `kycklingcykeln-github/dist` via den befintliga `.github/workflows/pages.yml`.
Packa upp uppdateringsfilen och ladda upp den medföljande mappen `kycklingcykeln-github` i repots rot, så att befintliga filer ersätts. Skapa inte en extra överordnad mapp. Behåll den befintliga workflow-filen. Commit på `main` startar GitHub Pages-jobbet; kontrollera att det blir grönt under Actions.

Verifierat med `node tests/gameplay.mjs`: tidigare regler, exakt boosttid inklusive paus/omstart, flera kollisioner/får, magnetinsamling, touchgester, namnhantering och sortering, sparfel, rekordmarkeringar samt material på den riktiga GLB-modellen. Ingen visuell webbläsargranskning är utförd.

## Starkare superboost (v13)

Knappens boost ger nu 4× aktuell grundfart i stället för 1,65×. Fyra aktiva sekunder, engångsanvändning, skydd och frömagnet finns kvar. Rampens separata boost är fortfarande 1,65×.
