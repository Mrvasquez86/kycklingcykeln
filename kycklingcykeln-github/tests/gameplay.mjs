import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
class Element {value='';children=[];listeners={};replaceChildren(){this.children=[];}appendChild(child){this.children.push(child);}paused=true;currentTime=0;play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}constructor(){this.style={};this.classList={add(){},remove(){},toggle(){}};}addEventListener(k,fn){this.listeners[k]=fn;}setAttribute(){}focus(){}blur(){}closest(){return null;}}
const elements=new Map([...ids].map(id=>[id,new Element()])),events={},storage=new Map([['kycklingcykeln.highscore.meters','500']]);
let bellOscillators=0;
class FakeAudio {createMediaElementSource(){return {connect(){}};}state='running';currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){bellOscillators++;return {frequency:{setValueAtTime(){}},connect(){},start(){},stop(){},disconnect(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
const context=vm.createContext({THREE,console,HTMLElement:Element,document:{createElement(){return new Element();},getElementById(id){assert.ok(elements.has(id),`Missing DOM element ${id}`);return elements.get(id);},addEventListener(){},activeElement:null},window:{AudioContext:FakeAudio,addEventListener(k,fn){events[k]=fn;}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},setTimeout,requestAnimationFrame(){}});
const src=fs.readFileSync(new URL('../dist/game.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'');
vm.runInContext(src,context);
const run=code=>vm.runInContext(code,context);
const reset=()=>run("scene=new THREE.Scene();player=new THREE.Group();chicken=new THREE.Group();start();spawnTimer=999;nextSheepDistance=Infinity;nextForkDistance=Infinity;nextPowerDistance=Infinity;nextRocketDistance=Infinity;");
// Gentler tiers and slower uncapped progression after 1500 m.
for(const [d,m] of [[0,1.3],[499.99,1.3],[500,1.8],[999.99,1.8],[1000,2.3],[1499.99,2.3],[1500,2.4],[1799.99,2.4],[1800,2.5],[2099.99,2.5],[2100,2.6],[2500,2.7],[3000,2.9],[5000,3.5],[10000,5.2]])assert.equal(run(`speedAtDistance(${d})`),11*m);
reset();assert.equal(run('speed'),11*1.3);assert.equal(elements.get('speed').textContent,'1.3×');
reset();run('distance=1000;spawnRow();');assert.equal(run("items.some(i=>i.type==='boulder')"),false);
run('distance=1000.01;spawnRow();spawnRow();');assert.equal(run("items.some(i=>i.type==='boulder')"),true);
reset();run('createBoulder(2,-30);distance=1500;tickGame(.02);');assert.ok(run('items[0].object.rotation.x')>0);assert.ok(run('items[0].object.position.z')> -30+run('speed')*.02);
for(const kind of [0,1]){reset();run(`createObstacle(0,-3.8,${kind});jump();`);for(let i=0;i<60;i++)run('tickGame(1/60);');assert.equal(run('falls'),0);assert.equal(run('jumpHeight'),0);}
reset();run('jump();tickGame(.1);');const velocity=run('jumpVelocity');run('jump();');assert.equal(run('jumpVelocity'),velocity);
reset();run('seeds=17;distance=1234;createObstacle(0,1.5,0);tickGame(.01);');
assert.equal(run('state'),'crashing');assert.equal(run('falls'),1);const checkpoint=run('distance'),z=run('items[0].object.position.z');
run('tickCrash(.55);');assert.ok(run('player.quaternion.angleTo(rideYaw)')>1.4);assert.equal(run('distance'),checkpoint);assert.equal(run('items[0].object.position.z'),z);
run('pause();');assert.equal(run('state'),'paused');run('pause();');assert.equal(run('state'),'crashing');run('tickCrash(1.55);');assert.equal(run('state'),'playing');assert.equal(run('distance'),checkpoint);assert.equal(run('seeds'),17);assert.ok(run('invulnerable')>0);assert.equal(run('items.length'),0);
run('invulnerable=0;createObstacle(0,1.5,0);tickGame(.01);tickCrash(2.1);');assert.equal(run('state'),'playing');
run('invulnerable=0;createObstacle(0,1.5,0);tickGame(.01);tickCrash(2.1);');assert.equal(run('state'),'over');assert.equal(run('falls'),3);assert.equal(elements.get('end').hidden,false);assert.equal(elements.get('touch-controls').hidden,true);assert.ok(run('player.quaternion.angleTo(rideYaw)')>1.4,'Final fall stays down');
reset();run('jumpHeight=1.55;createBoulder(0,1.5);tickGame(.01);');assert.equal(run('state'),'crashing');
reset();run('distance=3000;createObstacle(0,-1,0);tickGame(.1);');assert.equal(run('state'),'crashing','Fast collision cannot tunnel');
// A rider actually climbs the wedge, launches, boosts for three active seconds, then returns to base speed.
reset();run('createRamp(0,-3);');let mounted=false,launched=false;
for(let i=0;i<100;i++){run('tickGame(.01);');mounted ||=run('rampRide!==null');if(run('boostTime')>0){launched=true;break;}}
assert.ok(mounted&&launched);assert.equal(run('boostTime'),3);assert.ok(run('jumpVelocity')>7.8);assert.equal(run('falls'),0);
const base=run('speedAtDistance(distance)');run('tickGame(.1);');assert.ok(run('speed')>base);const remaining=run('boostTime');run('pause();');assert.equal(run('boostTime'),remaining);run('pause();');
for(let i=0;i<29;i++)run('tickGame(.1);');assert.equal(run('boostTime'),0);assert.equal(run('speed'),base);
// A manual jump over a ramp must not award an unearned boost.
reset();run('createRamp(0,0);jumpHeight=2;jumpVelocity=2;tickGame(.01);');assert.equal(run('boostTime'),0);assert.equal(run('rampRide'),null);
// Correct sky/light interval and sun/moon positions without a GPU.
reset();run('buildWorld();cyclist=new THREE.Group();player.add(cyclist);addHeadlight();');
for(const [d,on] of [[999.99,false],[1000,true],[1250,true],[1499.99,true],[1500,false],[2499.99,false],[2500,true],[2750,true],[2999.99,true],[3000,false],[4000,true],[4250,true],[4500,false],[16000,true],[16500,false]]){run(`distance=${d};updateWeather();`);assert.equal(run('headlight.visible'),on);}
run('distance=1250;updateWeather();');assert.ok(run('skySun.position.y')<0);assert.ok(run('skyMoon.position.y')>0);assert.ok(run('ambientLight.intensity')<.6);assert.ok(run('stars.material.opacity')>.8);
run('distance=1500;updateWeather();');assert.ok(run('skySun.position.y')>0);assert.ok(run('skyMoon.position.y')<0);assert.equal(run('nightAtDistance(1500)'),0);
for(const start of [1000,2500,4000,16000]){
 run(`distance=${start+250};updateWeather();`);assert.ok(run('skySun.position.y')<0);assert.ok(run('skyMoon.position.y')>0);
 assert.equal(run(`nightAtDistance(${start+20})`),.5);assert.equal(run(`nightAtDistance(${start+480})`),.5);
 run(`distance=${start+500};updateWeather();`);assert.ok(run('skySun.position.y')>0);assert.ok(run('skyMoon.position.y')<0);assert.equal(run('headlight.visible'),false);
}
// Highscore is meters, persists, rings only once after beating an existing record, and not at equality.
reset();run('highscore=500;recordToBeat=500;lastSavedHighscore=500;recordRang=false;distance=500;');bellOscillators=0;run('checkHighscore();');assert.equal(bellOscillators,0);run('distance=501;checkHighscore();');assert.equal(bellOscillators,6);run('distance=900;checkHighscore();saveHighscore();');assert.equal(bellOscillators,6);assert.equal(storage.get('kycklingcykeln.highscore.meters'),'900');
run('start();');assert.equal(run('recordToBeat'),900);assert.equal(run('recordRang'),false);assert.equal(run('distance'),0);assert.equal(run('falls'),0);
// Space and Up jump; Down replaces Up under the black-seed effect.
const key=k=>events.keydown({key:k,repeat:false,target:null,preventDefault(){}});
key('ArrowDown');assert.equal(run('jumpVelocity'),0);key('w');assert.equal(run('jumpVelocity'),0);key('ArrowRight');assert.equal(run('lane'),2);key(' ');assert.ok(run('jumpVelocity')>0);
// Obstacle spacing shrinks while double-obstacle probability and speed keep growing.
for(const [a,b] of [[0,500],[500,1500],[1500,5000],[5000,20000]]){
 assert.ok(run(`obstacleGap(${b})`)<run(`obstacleGap(${a})`));
 assert.ok(run(`secondObstacleChance(${b})`)>run(`secondObstacleChance(${a})`));
 assert.ok(run(`speedAtDistance(${b})`)>run(`speedAtDistance(${a})`));
}
// A single row always leaves a free lane, even at very high difficulty.
reset();run('distance=20000;');
for(let i=0;i<30;i++){
 const before=run('items.length');run('spawnRow();');
 const occupied=run(`new Set(items.slice(${before}).filter(i=>i.type==='obstacle'||i.type==='boulder').map(i=>i.object.position.x)).size`);
 assert.ok(occupied<=2);
}
// Deterministic RNG tests both random branches and the brief visible warning.
run('const savedRandom=Math.random;');
reset();run('Math.random=()=>.2;distance=1499.99;speed=27.5;createBoulder(0,-40);updateBoulderManeuver(items[0],.1);');
assert.equal(run('items[0].maneuver'),'waiting','No unpredictable maneuvers before 1500 m');
run('distance=1500;updateBoulderManeuver(items[0],.01);');assert.equal(run('items[0].action'),'swerve');assert.equal(run('items[0].object.position.x'),0,'Warning does not teleport');
run('updateBoulderManeuver(items[0],.1);');assert.equal(run('items[0].maneuver'),'warning');assert.ok(run('items[0].bodyMaterial.emissiveIntensity')>0);
for(let i=0;i<8;i++)run('updateBoulderManeuver(items[0],.1);');assert.equal(run('items[0].maneuver'),'done');assert.ok([-2,2].includes(run('items[0].object.position.x')));
reset();run('Math.random=()=>.8;distance=1500;speed=27.5;createBoulder(0,-40);updateBoulderManeuver(items[0],.01);');
assert.equal(run('items[0].action'),'rush');const oldRoll=run('items[0].rollSpeed');run('updateBoulderManeuver(items[0],.1);');assert.equal(run('items[0].rollSpeed'),oldRoll);
run('updateBoulderManeuver(items[0],.2);');assert.ok(run('items[0].rollSpeed')>oldRoll+20);assert.equal(run('items[0].object.position.x'),0);
// Never swerve beyond the edge, and do not spring a warning too late to react.
reset();run('Math.random=()=>.2;distance=1500;speed=27.5;createBoulder(-2,-40);updateBoulderManeuver(items[0],.01);');assert.equal(run('items[0].targetX'),0);
reset();run('distance=1500;speed=27.5;createBoulder(0,-4);updateBoulderManeuver(items[0],.01);');assert.equal(run('items[0].maneuver'),'done');assert.equal(run('items[0].action'),undefined);
run('Math.random=savedRandom;playerX=0;');
assert.equal(run("sweptItemHit({previousX:-2,previousZ:1.6,object:{position:{x:2,z:1.6}}},0,.7,1.04)"),true,'Catch a lateral crossing');
assert.equal(run("sweptItemHit({previousX:-2,previousZ:1.6,object:{position:{x:2,z:20}}},0,.7,1.04)"),false,'No collision when lateral and forward contacts occur at different times');
// Sheep block all lanes regardless of jump height, but never cost a crash.
reset();run('lane=0;playerX=-2;jumpHeight=3;createFlock(-1.3);tickGame(.1);');
assert.equal(run('state'),'sheep');assert.equal(run('falls'),0);assert.equal(elements.get('sheep-hint').hidden,false);
const sheepCheckpoint=run('distance');run('tickSheepWait(2);steer(1);jump();');assert.equal(run('state'),'sheep');assert.equal(run('distance'),sheepCheckpoint);assert.equal(run('lane'),0);
const soundsBefore=bellOscillators;key('r');assert.equal(bellOscillators,soundsBefore+6);assert.equal(run('items[0].clearing'),true);
key('r');assert.equal(bellOscillators,soundsBefore+6,'Bell has a short repeat cooldown');run('pause();');assert.equal(run('state'),'paused');run('pause();');assert.equal(run('state'),'sheep');
run('tickSheepWait(.5);');assert.equal(run('state'),'sheep');run('tickSheepWait(.41);');assert.equal(run('state'),'playing');assert.equal(run('distance'),sheepCheckpoint);assert.equal(run('falls'),0);
// Dark seeds reverse steering for exactly three seconds of riding and do not award points.
reset();run('createSeed(0,1.5,{dark:true});tickGame(.01);');assert.equal(run('reverseTime'),3);assert.equal(run('seeds'),0);
run('steer(1);');assert.equal(run('lane'),0);run('steer(-1);');assert.equal(run('lane'),1);
run('handleSwipe(0,-60);');assert.equal(run('jumpVelocity'),0);run('handleSwipe(0,60);');assert.ok(run('jumpVelocity')>0,'Vertical touch gesture reverses');
run('pause();');assert.equal(run('reverseTime'),3);run('pause();tickGame(2.9);');assert.ok(run('reverseTime')>.09);run('tickGame(.1);');assert.equal(run('reverseTime'),0);run('lane=1;steer(1);');assert.equal(run('lane'),2);
// The ramp's flight-path rewards are reachable on the actual jump, and unreachable from the ground.
reset();run('createRamp(0,-3);');assert.equal(run("items.filter(i=>i.type==='seed'&&i.air).length"),5);
assert.equal(run("seedInReach(items.find(i=>i.air))"),false);run('jumpHeight=1.6;');assert.equal(run("seedInReach(items.find(i=>i.air))"),false);run('jumpHeight=0;');
for(let i=0;i<150;i++)run('tickGame(.01);');assert.equal(run('seeds'),5,'Riding the ramp collects its airborne seed trail');assert.equal(run('falls'),0);
// Moderate density stays bounded, and double-obstacle rows never occur consecutively.
assert.ok(run('obstacleGap(5000)')>22);assert.ok(run('obstacleGap(5000)')<24);assert.ok(run('secondObstacleChance(5000)')>.38);assert.ok(run('secondObstacleChance(5000)')<.4);
reset();run('distance=5000;');let previousDouble=false;
for(let i=0;i<40;i++){const before=run('items.length');run('spawnRow();');const count=run(`items.slice(${before}).filter(i=>i.type==='obstacle'||i.type==='boulder').length`);assert.ok(!(previousDouble&&count===2));previousDouble=count===2;}
run('start();');assert.equal(run('reverseTime'),0);assert.equal(run('awaitingFlock'),null);
console.log('Passed: gentler pacing, sheep cannot be bypassed, audible R bell and mobile action, three-second reversed steering and gestures, collectible ramp seed trail, plus existing gameplay regression checks.');

// Music follows game state, retains its position on pause, and has independent volume.
reset();assert.equal(elements.get('background-music').paused,false);assert.equal(run('musicGain.gain.value'),.35);
run('backgroundMusic.currentTime=42;pause();');assert.equal(elements.get('background-music').paused,true);
run('pause();');assert.equal(elements.get('background-music').paused,false);assert.equal(run('backgroundMusic.currentTime'),42);
run('setMusicVolume(70);');assert.equal(run('musicGain.gain.value'),.7);assert.equal(elements.get('music-level').textContent,'70 %');
run('toggleMusic();pause();pause();');assert.equal(elements.get('background-music').paused,true);
run('toggleMusic();');assert.equal(elements.get('background-music').paused,false);
run("state='sheep';setPanels();");assert.equal(elements.get('background-music').paused,false);
run('finishRun();');assert.equal(elements.get('background-music').paused,true);
run('start();');assert.equal(run('backgroundMusic.currentTime'),0);assert.equal(elements.get('background-music').paused,false);
run('document.hidden=true;syncMusic();');assert.equal(elements.get('background-music').paused,true);
run('document.hidden=false;');events.pagehide();assert.equal(elements.get('background-music').paused,true);
assert.match(html, /id="background-music"[^>]+ loop /);
console.log('Passed: music start, loop configuration, pause/resume position, mute, independent volume, sheep, game over, restart and hidden page.');

// Both keyboard jump bindings and their exact reversal; Space stays reliable.
reset();key('ArrowUp');assert.equal(run('jumpVelocity'),7.8);
reset();run('reverseTime=3;');key('ArrowUp');assert.equal(run('jumpVelocity'),0);key('ArrowDown');assert.equal(run('jumpVelocity'),7.8);
reset();run('reverseTime=3;');key(' ');assert.equal(run('jumpVelocity'),7.8);
run('Math.random=()=>.9;');
// An ordinary ramp never launches a rocket. A rocket ramp must actually be ridden.
reset();run('createRamp(0,-3,true);');assert.equal(run('rocketTime'),0);
for(let i=0;i<70&&run('rocketTime')===0;i++)run('tickGame(.01);');
assert.equal(run('rocketTime'),5);assert.equal(run('boostTime'),0);
assert.equal(run('items.filter(i=>i.rocketFlight).length'),18);
run('tickGame(.8);');
const flightBeforePause=run('rocketTime');run('pause();');assert.equal(run('rocketTime'),flightBeforePause);run('pause();');
for(let i=0;i<70;i++)run('tickGame(.01);');
const collectedBeforeLanding=run('seeds');assert.ok(collectedBeforeLanding>0);
for(let i=0;i<351;i++)run('tickGame(.01);');
assert.equal(run('rocketTime'),0);assert.equal(run('jumpHeight'),0);assert.equal(run('seeds'),54,'18 airborne seeds worth three each');assert.equal(run('falls'),0);

// Flight trail remains reachable when passing a speed tier and when slowmotion expires.
for(const meters of [480,980,1490,10000]){
 reset();run(`distance=${meters};slowTime=1.3;speed=speedAtDistance(distance);jumpHeight=.9;startRocket();`);
 for(let i=0;i<501;i++)run('tickGame(.01);');
 assert.equal(run('rocketTime'),0);assert.equal(run('seeds'),54,`Reachable rewards at ${meters} m`);
}
// Rare rocket opportunities: minimum distance, 20% random gate, 700 m cooldown.
reset();run('nextRocketDistance=250;Math.random=()=>.1;distance=249;rowCount=1;spawnRow();');assert.equal(run('items.some(i=>i.rocket)'),false);
run('distance=250;rowCount=1;spawnRow();');assert.equal(run('items.filter(i=>i.rocket).length'),1);assert.equal(run('nextRocketDistance'),950);
run('distance=949;rowCount=1;spawnRow();');assert.equal(run('items.filter(i=>i.rocket).length'),1);
run('distance=950;Math.random=()=>.8;rowCount=1;spawnRow();');assert.equal(run('items.filter(i=>i.rocket).length'),1);
run('Math.random=savedRandom;');
// Magnet excludes black seeds; shield consumes one collision; slowmotion expires to current base speed.
reset();run("createPower(0,1.5,'magnet');tickGame(.01);createSeed(2,-1);createSeed(-2,-1,{dark:true});tickGame(.01);tickGame(.5);");
assert.equal(run('seeds'),1);assert.equal(run('reverseTime'),0);assert.equal(run('items.some(i=>i.dark&&!i.passed)'),true);
reset();run("createPower(0,1.5,'shield');tickGame(.01);createObstacle(0,1.5,0);tickGame(.01);");assert.equal(run('falls'),0);assert.equal(run('shieldTime'),0);
run('invulnerable=0;createObstacle(0,1.5,0);tickGame(.01);');assert.equal(run('falls'),1);
reset();run("createPower(0,1.5,'slow');tickGame(.01);tickGame(.1);");assert.equal(run('speed'),run('speedAtDistance(distance)*.65'));
run('pause();');const frozenPower=run('slowTime');assert.equal(run('slowTime'),frozenPower);run('pause();');
for(let i=0;i<500;i++)run('tickGame(.01);');assert.equal(run('slowTime'),0);assert.equal(run('speed'),run('speedAtDistance(distance)'));
// Route gates choose the branch the player entered; buttons work under reversal, too.
reset();run("createFork(-5);reverseTime=3;chooseRoute('adventure');");assert.equal(run('lane'),2);
for(let i=0;i<60;i++)run('tickGame(.01);');assert.equal(run('route'),'adventure');assert.ok(run('routeTime')>0);
reset();run("createFork(-5);chooseRoute('calm');");for(let i=0;i<60;i++)run('tickGame(.01);');assert.equal(run('route'),'calm');
run('tickPowers(13);');assert.equal(run('route'),null);
// Equipment spends banked seeds only once, equips by category, survives restart and rejects unaffordable purchases.
reset();run("gear={bank:0,owned:['helmet-original','bike-original'],helmet:'helmet-original',bike:'bike-original'};");
assert.equal(run("buyEquipment('helmet-red')"),false);run('awardSeeds(100);');assert.equal(run("buyEquipment('helmet-red')"),true);assert.equal(run('gear.bank'),20);assert.equal(run('seeds'),100);
run("buyEquipment('helmet-red');");assert.equal(run('gear.bank'),20);assert.equal(run('loadGear().helmet'),'helmet-red');
run('start();');assert.equal(run('gear.bank'),20);assert.equal(run('gear.helmet'),'helmet-red');assert.equal(run('seeds'),0);
run('openShop();');assert.equal(run('state'),'paused');assert.equal(elements.get('equipment-panel').hidden,false);run('closeShop();');assert.equal(run('state'),'playing');
run('pause();openShop();closeShop();');assert.equal(run('state'),'paused','Closing shop preserves a pre-existing pause');
console.log('Passed: rocket launch and five-second flight, all 54 trail points at changing speeds, rarity and cooldown, reversed Up/Down, powers, route choice, equipment purchase/persistence and shop pause.');

// v11: a single flight trail, with a reachable handover gap when it changes lanes.
for(const changes of [false,true]){
 for(const startLane of [0,1,2]){
  const trail=run(`rocketTrail(${startLane},${changes})`);
  assert.equal(trail.length,18);assert.equal(new Set(trail.map(p=>p.time)).size,18,'Never parallel seed rows');
  assert.equal(new Set(trail.map(p=>p.lane)).size,changes?2:1);
  if(changes){assert.ok(trail[9].time-trail[8].time>=.6);assert.equal(Math.abs(trail[9].lane-startLane),1);}
 }
}
for(const meters of [0,980,1490,10000]){
 reset();run(`Math.random=()=>.2;distance=${meters};speed=speedAtDistance(distance);jumpHeight=.9;startRocket();`);
 const secondLane=run('lanes.indexOf(items.find(i=>i.rocketFlight&&i.flightTime>2.5).object.position.x)');
 for(let i=0;i<501;i++){if(run('5-rocketTime')>2.35)run(`lane=${secondLane};`);run('tickGame(.01);');}
 assert.equal(run('seeds'),54,'Switching lanes in the gap collects all eighteen rewards');
}
run('Math.random=savedRandom;');
// Sheep remove at most 50 currently-held seeds once, with real bouncing, noncollectible seed pieces.
reset();run('seeds=80;gear.bank=100;createFlock(-1.3);tickGame(.02);');
assert.equal(run('state'),'sheep');assert.equal(run('seeds'),30);assert.equal(run('gear.bank'),50);assert.equal(run('falls'),0);
assert.equal(run('particles.filter(p=>p.spill).length'),50);assert.equal(run("items.filter(i=>i.type==='seed').length"),0);
run('hitSheep(awaitingFlock);tickSheepWait(.1);');assert.equal(run('seeds'),30);
run('particles[0].object.position.y=.15;particles[0].velocity.y=-3;tickSheepWait(.05);');assert.ok(run('particles[0].velocity.y')>0,'Spilled seed bounces on the ground');
run('pause();');const lostCheckpoint=run('seeds');run('pause();honk();tickSheepWait(1);');assert.equal(run('seeds'),lostCheckpoint);assert.equal(run('state'),'playing');
reset();run('seeds=12;gear.bank=8;createFlock(-1.3);tickGame(.02);');assert.equal(run('seeds'),0);assert.equal(run('gear.bank'),0);assert.equal(run('particles.length'),12);
reset();run('seeds=80;createFlock(-8);honk();');for(let i=0;i<120;i++)run('tickGame(.01);');assert.equal(run('seeds'),80,'Ringing before contact avoids the loss');
// Magnet acquisition is visible over time and awards only once on arrival, including after its timer expires.
reset();run("magnetTime=1;createSeed(2,-8);createSeed(-2,-8,{dark:true});tickGame(.01);");
assert.equal(run('items[0].pulling'),true);assert.equal(run('items[1].pulling'),undefined);assert.equal(run('seeds'),0);assert.equal(run('items[0].object.visible'),true);
const fromZ=run('items[0].object.position.z');run('tickGame(.2);');assert.ok(run('items[0].object.position.z')>fromZ);assert.ok(run('items[0].object.position.x')<2);assert.equal(run('seeds'),0);
run('magnetTime=0;tickGame(.29);');assert.equal(run('seeds'),1);run('tickGame(.1);');assert.equal(run('seeds'),1);
// Load the actual supplied GLB without a browser to verify isolated end-scene geometry.
const vendor=new URL('../dist/vendor/',import.meta.url),threeURL=new URL('three.module.js',vendor).href;
const util=fs.readFileSync(new URL('examples/jsm/utils/BufferGeometryUtils.js',vendor),'utf8').replace("from 'three'",`from '${threeURL}'`);
const utilURL='data:text/javascript;base64,'+Buffer.from(util).toString('base64');
const loaderCode=fs.readFileSync(new URL('examples/jsm/loaders/GLTFLoader.js',vendor),'utf8').replace("from 'three'",`from '${threeURL}'`).replace("from '../utils/BufferGeometryUtils.js'",`from '${utilURL}'`);
const {GLTFLoader}=await import('data:text/javascript;base64,'+Buffer.from(loaderCode).toString('base64'));
const glb=fs.readFileSync(new URL('../dist/assets/kyckling-cykel.glb',import.meta.url));
const model=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
context.testChick=model.scene.getObjectByName('Kyckling');
run('buildEndScene(testChick);');assert.equal(run('endScene.children.includes(endChicken)'),true);
assert.ok(run("endChicken.getObjectByName('RecoveryCrutch')"));
run("const originalHelmet=[];testChick.traverse(o=>{if(o.isMesh&&o.material.name==='Hjalm - olivgron')originalHelmet.push(o);});");
assert.ok(run('endHelmet.geometry.index.count')<run('originalHelmet[0].geometry.index.count'),'The end helmet has a missing section');
assert.notEqual(run('endHelmet.geometry'),run('originalHelmet[0].geometry'));
run("gear.helmet='helmet-red';finishRun();");assert.equal(run('endHelmet.material.color.getHex()'),0xf05642);assert.equal(elements.get('end-character').hidden,false);
assert.equal(elements.get('final-seeds').textContent,run('seeds'));
run('start();');assert.equal(elements.get('end-character').hidden,true);assert.equal(run('state'),'playing');
console.log('Passed: sequential flight trails and lane handover, one-time sheep loss and bouncing seeds, visible magnet travel and one-time scoring, real-model recovery scene, damaged helmet isolation and clean restart.');
// Single-use protection covers sheep and multiple obstacles for exactly four active seconds.
reset();run('shieldTime=8;seeds=80;createFlock(-2);createObstacle(0,1.5,0);createBoulder(0,1.5);activateSuperBoost();tickGame(.01);');
assert.equal(run('speed'),run('speedAtDistance(distance)*4'));assert.equal(run('falls'),0);assert.equal(run('state'),'playing');assert.equal(run('seeds'),80);assert.ok(run('shieldTime')>7);assert.equal(run('activateSuperBoost()'),false);
run('pause();tickGame(1);');assert.equal(run('superBoostTime'),3.99);run('pause();');
run('tickGame(3.98);');assert.ok(run('superBoostTime')>0);run('tickGame(.02);');assert.equal(run('superBoostTime'),0);assert.equal(run('superBoostUsed'),true);
run('shieldTime=0;invulnerable=0;createObstacle(0,1.5,0);tickGame(.01);');assert.equal(run('falls'),1);
reset();assert.equal(run('superBoostUsed'),false);assert.equal(run('activateSuperBoost()'),true);
// All three lanes, including airborne gold seeds, animate into the rider and score once.
reset();run('activateSuperBoost();createSeed(-2,-4);createSeed(0,-4);createSeed(2,-4,{height:4.95,air:true,value:3});createSeed(0,-4,{dark:true});tickGame(.01);');
assert.equal(run('items.filter(i=>i.pulling).length'),3);assert.equal(run('seeds'),0);
for(let i=0;i<60;i++)run('tickGame(.01);');assert.equal(run('seeds'),5);assert.equal(run('reverseTime'),0);
reset();run('createFlock(-1.2);tickGame(.01);');assert.equal(run('state'),'sheep');run('activateSuperBoost();tickGame(.01);');assert.equal(run('state'),'playing');
// Double taps ring on touch only; swipes, holds, cancellation and separate taps do not.
reset();bellOscillators=0;const world=elements.get('world');
const tap=(t,x=50,type='touch',duration=60)=>{world.listeners.pointerdown({pointerId:1,clientX:x,clientY:50,timeStamp:t,isPrimary:true});world.listeners.pointerup({pointerId:1,clientX:x,clientY:50,timeStamp:t+duration,pointerType:type,preventDefault(){}});};
tap(100);assert.equal(bellOscillators,0);tap(250);assert.equal(bellOscillators,6);
run('bellCooldown=0;');tap(1000,50,'mouse');tap(1150,50,'mouse');assert.equal(bellOscillators,6);
tap(2000);tap(2600);assert.equal(bellOscillators,6);
world.listeners.pointercancel();tap(3000,50,'touch',400);tap(3450);assert.equal(bellOscillators,6);
world.listeners.pointercancel();tap(4000);world.listeners.pointerdown({pointerId:1,clientX:50,clientY:50,timeStamp:4150});world.listeners.pointerup({pointerId:1,clientX:110,clientY:50,timeStamp:4200,pointerType:'touch'});tap(4300);assert.equal(bellOscillators,6);
// Run scores are snapshots, escaped as text, sorted by seeds then distance, saved only once.
reset();run('seeds=42;distance=987.8;finishRun();');elements.get('player-name').value='<b>Racer</b>';assert.equal(run('saveRunScore()'),true);assert.equal(run('saveRunScore()'),false);
assert.equal(run('scoreRows[0].name'),'<b>Racer</b>');assert.equal(run('scoreRows[0].seeds'),42);assert.equal(run('scoreRows[0].distance'),987);
assert.equal(elements.get('scores-body').children[0].children[1].textContent,'<b>Racer</b>');
assert.ok(storage.get('kycklingcykeln.scores.v1').includes('Racer'));
assert.equal(run("rankScores([{name:'A',seeds:2,distance:100,time:1},{name:'B',seeds:3,distance:1,time:2},{name:'C',seeds:2,distance:200,time:3}]).map(r=>r.name).join(',')"),'B,C,A');
run('start();openScores();');assert.equal(run('state'),'paused');assert.equal(elements.get('scores-panel').hidden,false);run('closeScores();');assert.equal(run('state'),'playing');
const setItem=context.localStorage.setItem;context.localStorage.setItem=()=>{throw new Error('quota');};
run('seeds=10;distance=20;finishRun();');elements.get('player-name').value='Offline';assert.equal(run('saveRunScore()'),true);assert.ok(elements.get('score-status').textContent.includes('sessionen'));context.localStorage.setItem=setItem;
// Last finish and best distance are separate markers, persisted and crossed only once.
reset();run('seeds=3;distance=750.9;finishRun();start();');assert.equal(run('lastRunDistance'),750);assert.equal(storage.get('kycklingcykeln.last-run.meters'),'750');
assert.equal(run("runMarkers.find(m=>m.label==='Förra rundan').meters"),750);
run('distance=750;updateRunMarkers();');assert.equal(run("runMarkers.find(m=>m.label==='Förra rundan').crossed"),false);
run('distance=751;updateRunMarkers();');assert.equal(run("runMarkers.find(m=>m.label==='Förra rundan').crossed"),true);assert.ok(elements.get('feedback').textContent.includes('förra rundans'));
// Actual model: equipped helmet and bike are reflected immediately on the result screen.
context.testBike=model.scene.getObjectByName('Cykel');run("buildEndScene(testChick,testBike);gear.helmet='helmet-gold';gear.bike='bike-pink';applyEquipment();");
assert.equal(run('endHelmet.material.color.getHex()'),0xffc52f);
assert.ok(run("endGearMeshes.some(g=>g.kind==='bike'&&g.mesh.material.color.getHex()===0xed489e)"));
run("gear.helmet='helmet-original';syncEndEquipment();");assert.equal(run('endHelmet.material.color.getHex()'),run("endGearMeshes.find(g=>g.kind==='helmet').original.getHex()"));
assert.equal(src.includes('doTrick'),false);assert.equal(ids.has('trick'),false);
console.log('Passed: exact four-second reusable-on-restart boost, collisions and sheep immunity, all-lane suction, touch double-tap discrimination, safe ranked score snapshots and persistence failure, markers and full equipped recovery model.');
