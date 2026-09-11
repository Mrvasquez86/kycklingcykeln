import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const $=id=>document.getElementById(id);
const ui={game:$('game'),start:$('start'),intro:$('intro'),pause:$('pause'),paused:$('pause-panel'),hud:$('hud'),touch:$('touch-controls'),seeds:$('seeds'),distance:$('distance'),speed:$('speed'),falls:$('falls'),jump:$('jump'),best:$('best'),boost:$('boost'),end:$('end'),reverse:$('reverse'),bell:$('bell'),sheepHint:$('sheep-hint')};
let scene,camera,renderer,player,cyclist,chicken,wheels=[];
let state='loading',lane=1,playerX=0,elapsed=0,distance=0,seeds=0,falls=0,speed=speedAtDistance(0),spawnTimer=0,invulnerable=0,feedbackTime=0,scenery=[],items=[],particles=[],roadMarks=[];
const lanes=[-2,0,2],clock=new THREE.Clock();
let jumpHeight=0,jumpVelocity=0,crashTime=0,crashX=0,crashSide=1,crashStartHeight=0,resumeState='playing',recoveryTime=2,firstBoulder=false,klotNotice=false;
const JUMP_SPEED=7.8,GRAVITY=19,CRASH_DURATION=2.1;
const rideYaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
const rollAxis=new THREE.Vector3(1,0,0),rollQuaternion=new THREE.Quaternion();
function speedAtDistance(meters){const d=Math.max(0,meters);const tenths=d<500?13:d<1000?18:d<1500?23:24+Math.floor((d-1500)/300);return 11*(tenths/10);}
function obstacleGap(meters){return 18+16/(1+Math.max(0,meters)/2200);}
function secondObstacleChance(meters){return .14+.40*Math.max(0,meters)/(Math.max(0,meters)+3000);}
function canJumpOver(item,height){return (item.type==='obstacle'||item.type==='boulder')&&height>item.height+.08;}
function jump(){if(state!=='playing'||jumpHeight>0||jumpVelocity>0)return;rampRide=null;airTricks=0;pendingTrickBonus=0;jumpVelocity=JUMP_SPEED;}

let reverseTime=0,bellCooldown=0,awaitingFlock=null,nextSheepDistance=400,lastRowDouble=false;
let boostTime=0,rampRide=null,rowCount=0,skySun,skyMoon,stars,ambientLight,sunLight,fillLight,headlight,lampLens,cloudMaterial;
let audioContext=null,highscore=readHighscore(),recordToBeat=highscore,recordRang=false,lastSavedHighscore=highscore;
const BOOST_DURATION=3,BOOST_FACTOR=1.65,HIGHSCORE_KEY='kycklingcykeln.highscore.meters';
// The supplied track uses its own gain, independently of the bicycle bell.
const backgroundMusic=$('background-music');
let musicEnabled=true,musicVolume=.35,musicGain=null,musicSource=null;
function updateMusicVolume(){
 if(musicGain){musicGain.gain.value=musicVolume;backgroundMusic.volume=1;}
 else backgroundMusic.volume=musicVolume;
 $('music-level').textContent=Math.round(musicVolume*100)+' %';
}
function syncMusic(){
 $('music-toggle').textContent=musicEnabled?'Musik på':'Musik av';
 $('music-toggle').setAttribute('aria-pressed',String(musicEnabled));
 const shouldPlay=musicEnabled&&!document.hidden&&['playing','crashing','sheep'].includes(state);
 if(!shouldPlay){backgroundMusic.pause();return;}
 unlockSound();
 // GainNode also provides volume control on mobile browsers with fixed media volume.
 if(!musicSource&&audioContext?.createMediaElementSource){
  try{musicGain=audioContext.createGain();musicSource=audioContext.createMediaElementSource(backgroundMusic);
   musicSource.connect(musicGain);musicGain.connect(audioContext.destination);
  }catch{musicGain=null;}
 }
 updateMusicVolume();
 if(backgroundMusic.paused){
  $('music-status').hidden=true;
  backgroundMusic.play()?.catch(error=>{
   if(error.name==='AbortError'||!musicEnabled||!['playing','crashing','sheep'].includes(state))return;
   $('music-status').textContent='Musiken kunde inte starta. Slå av och på musiken för att försöka igen.';$('music-status').hidden=false;
  });
 }
}
function toggleMusic(){musicEnabled=!musicEnabled;syncMusic();}
function setMusicVolume(value){const n=Number(value);if(!Number.isFinite(n))return;musicVolume=Math.max(0,Math.min(1,n/100));updateMusicVolume();}
function readHighscore(){try{const n=Number(localStorage.getItem('kycklingcykeln.highscore.meters'));return Number.isFinite(n)&&n>0?Math.floor(n):0;}catch{return 0;}}
function saveHighscore(){if(highscore<=lastSavedHighscore)return;try{localStorage.setItem(HIGHSCORE_KEY,String(highscore));lastSavedHighscore=highscore;}catch{}}
function unlockSound(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;if(!audioContext)audioContext=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}}
function ringBell(){
 if(!audioContext||audioContext.state!=='running')return;
 // Two strikes with decaying metallic harmonics: a bicycle bell, without a sound download.
 for(const delay of [0,.16])for(const [hz,level] of [[1175,.16],[2358,.07],[3520,.025]]){
  const t=audioContext.currentTime+delay,osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(hz,t);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(level,t+.004);gain.gain.exponentialRampToValueAtTime(.0001,t+1.15);
  osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+1.2);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }
}
function checkHighscore(){
 const meters=Math.floor(distance);
 if(recordToBeat>0&&!recordRang&&meters>recordToBeat){recordRang=true;ringBell();notify('Pling! Nytt personbästa!');feedbackTime=3;}
 if(meters>highscore){highscore=meters;if(highscore-lastSavedHighscore>=100)saveHighscore();}
}
function dayCyclePosition(meters){return Math.max(0,meters)%1500;}
function nightAtDistance(meters){
 const phase=dayCyclePosition(meters);
 const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 return ease((phase-1000)/40)*(1-ease((phase-1460)/40));
}
function updateWeather(){
 if(!ambientLight)return;
 const n=nightAtDistance(distance),lampOn=dayCyclePosition(distance)>=1000;
 const day=new THREE.Color(0xa8dfe0),twilight=new THREE.Color(0xda926f),night=new THREE.Color(0x111a3d);
 const sky=n<.45?day.lerp(twilight,n/.45):twilight.lerp(night,(n-.45)/.55);
 scene.background.copy(sky);scene.fog.color.copy(sky);scene.fog.far=100-20*n;
 ambientLight.intensity=2.3-1.86*n;ambientLight.color.set(n>.5?0x99baff:0xfff9e0);
 sunLight.intensity=2.8*(1-n);fillLight.intensity=.6+.2*n;fillLight.color.set(n>.5?0xadc5ff:0xc3eeff);
 skySun.position.set(-14-12*n,13-30*n,-52);skyMoon.position.set(20-10*n,-17+30*n,-52);
 stars.material.opacity=n*.9;cloudMaterial.color.set(0xf3f6da).lerp(new THREE.Color(0x444d77),n);
 if(headlight){headlight.intensity=lampOn?160:0;headlight.visible=lampOn;lampLens.emissiveIntensity=lampOn?4:0;}
 ui.game.classList.toggle('night',n>.55);
}
function buildSky(){
 skySun=mesh(new THREE.SphereGeometry(2.7,24,16),new THREE.MeshBasicMaterial({color:0xffd364}),scene,[-14,13,-52]);skySun.castShadow=false;
 skyMoon=new THREE.Group();const moon=mesh(new THREE.SphereGeometry(2.2,24,16),new THREE.MeshBasicMaterial({color:0xe4ecff}),skyMoon,[0,0,0]);moon.castShadow=false;
 const craterMat=new THREE.MeshBasicMaterial({color:0xb8c7e3});
 for(const [x,y,r] of [[-.6,.6,.43],[.5,-.5,.35],[.7,.65,.22],[-.45,-.7,.23]]){const c=ball(r,craterMat,skyMoon,[x,y,Math.sqrt(2.2*2.2-x*x-y*y)],1);c.scale.z=.09;c.castShadow=false;}
 scene.add(skyMoon);
 const points=[];for(let i=0;i<100;i++)points.push((Math.random()-.5)*120,6+Math.random()*45,-55-Math.random()*25);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));stars=new THREE.Points(geo,new THREE.PointsMaterial({color:0xebf2ff,size:.19,transparent:true,opacity:0,depthWrite:false}));scene.add(stars);
}
function addHeadlight(){
 const casing=mesh(new THREE.CylinderGeometry(.13,.13,.18,16),m.band,cyclist,[2.72,1.78,0]);casing.rotation.z=-Math.PI/2;
 lampLens=new THREE.MeshStandardMaterial({color:0xfff4bb,emissive:0xffedab,emissiveIntensity:0,roughness:.25});
 const lens=mesh(new THREE.CircleGeometry(.115,20),lampLens,cyclist,[2.82,1.78,0]);lens.rotation.y=Math.PI/2;
 headlight=new THREE.SpotLight(0xffefbb,0,36,Math.PI/6,.45,1.25);headlight.position.set(2.86,1.78,0);headlight.target.position.set(17,0,0);cyclist.add(headlight,headlight.target);headlight.visible=false;
}
function finishRun(){syncEndEquipment();resetAir();saveGear();state='over';boostTime=0;reverseTime=0;rampRide=null;player.visible=true;checkHighscore();saveHighscore();$('final-distance').textContent=Math.floor(distance);$('final-seeds').textContent=seeds;$('final-best').textContent=highscore;updateHud();setPanels();$('end-restart').focus();}

const colors={grass:0x75b851,road:0xe7c797,edge:0xd3ae79,leaf:0x468b50,leaf2:0x65a44e,wood:0x895936,gold:0xfacb3b};
const mat=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
const m={grass:mat(colors.grass),road:mat(colors.road),edge:mat(colors.edge),leaf:mat(colors.leaf),leaf2:mat(colors.leaf2),wood:mat(colors.wood),white:mat(0xfff0c4),stone:mat(0x8e9c91),crate:mat(0xcb8348),band:mat(0x996338),gold:mat(colors.gold,.32),stripe:mat(0x986827),flower:mat(0xf8da4c),soil:mat(0x83552c),ramp:mat(0x158a86),blackSeed:mat(0x10121a,.35),blackStripe:mat(0x8e80a0,.5),wool:mat(0xf2efe4),sheepDark:mat(0x303337)};
function mesh(geometry,material,parent,pos){const o=new THREE.Mesh(geometry,material);if(pos)o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function box(w,h,d,material,parent,pos){return mesh(new THREE.BoxGeometry(w,h,d),material,parent,pos);}
function ball(r,material,parent,pos,detail=1){return mesh(new THREE.IcosahedronGeometry(r,detail),material,parent,pos);}
function setPanels(){
 const inRide=['playing','crashing','paused','over','sheep'].includes(state);
 ui.intro.hidden=state!=='ready'&&state!=='loading';ui.paused.hidden=state!=='paused';ui.hud.hidden=!inRide;ui.touch.hidden=state!=='playing'&&state!=='sheep';ui.sheepHint.hidden=state!=='sheep';ui.pause.hidden=!inRide||state==='over';ui.end.hidden=state!=='over';$('end-character').hidden=state!=='over';ui.game.classList.toggle('playing',inRide);ui.game.classList.toggle('game-over',state==='over');
 ui.pause.textContent=state==='paused'?'▶':'Ⅱ';ui.pause.setAttribute('aria-label',state==='paused'?'Fortsätt spela':'Pausa spelet');syncMusic();updateAdventureHud();
}
function notify(text){$('feedback').textContent=text;$('feedback').classList.add('visible');feedbackTime=1.5;}
function updateHud(){ui.seeds.textContent=seeds;ui.distance.textContent=Math.floor(distance);ui.speed.textContent=(speed/11).toFixed(1)+'×';ui.falls.textContent=falls+' / 3';ui.best.textContent=highscore;ui.boost.hidden=boostTime<=0;ui.boost.textContent='BOOST · '+boostTime.toFixed(1)+' s';ui.jump.disabled=state!=='playing'||jumpHeight>0||jumpVelocity>0;$('left').disabled=$('right').disabled=state!=='playing';ui.reverse.hidden=reverseTime<=0;ui.reverse.textContent='OMVÄND STYRNING · '+reverseTime.toFixed(1)+' s · ↓ hoppar';updateAdventureHud();}
function start(){
 if(!player)return;unlockSound();backgroundMusic.currentTime=0;$('music-controls').open=false;saveHighscore();recordToBeat=highscore;recordRang=false;
 for(const item of items){scene.remove(item.object);disposeGeometry(item.object);}items=[];
 for(const p of particles){scene.remove(p.object);disposeGeometry(p.object);}particles=[];
 resetAdventure();state='playing';lane=1;playerX=0;elapsed=distance=seeds=falls=0;speed=speedAtDistance(0);spawnTimer=18;invulnerable=0;feedbackTime=0;jumpHeight=jumpVelocity=crashTime=0;recoveryTime=2;firstBoulder=klotNotice=false;boostTime=0;rampRide=null;rowCount=0;reverseTime=0;bellCooldown=0;awaitingFlock=null;nextSheepDistance=350+Math.random()*200;lastRowDouble=false;
 player.visible=true;player.position.set(0,.045,1.6);player.quaternion.copy(rideYaw);if(chicken)chicken.rotation.z=0;
 updateHud();setPanels();$('vignette').style.opacity=0;$('feedback').classList.remove('visible');clock.getDelta();if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
}
function pause(){
 if(shopOpen)return;
 if(state==='playing'||state==='crashing'||state==='sheep'){resumeState=state;state='paused';setPanels();$('resume').focus();}
 else if(state==='paused'){state=resumeState;setPanels();clock.getDelta();if(document.activeElement instanceof HTMLElement)document.activeElement.blur();}
}
function crash(item){
 resetAir();item.passed=true;falls++;crashTime=0;crashX=playerX;crashStartHeight=jumpHeight;crashSide=playerX>1?-1:1;jumpVelocity=0;state='crashing';player.visible=true;
 rampRide=null;notify(falls>=3?'Tre vurpor. Turen är slut.':'Hoppsan! Upp igen på samma plats.');feedbackTime=CRASH_DURATION;setPanels();updateHud();$('vignette').style.opacity=.8;
}
function tickCrash(dt){
 tickParticles(dt);
 crashTime=Math.min(CRASH_DURATION,crashTime+dt);
 const smooth=t=>t*t*(3-2*t);
 let roll=crashTime<.55?smooth(crashTime/.55):crashTime<1.2?1:1-smooth((crashTime-1.2)/.9);
 if(falls>=3&&crashTime>=.55)roll=1;
 roll=Math.max(0,Math.min(1,roll));
 player.quaternion.copy(rideYaw).multiply(rollQuaternion.setFromAxisAngle(rollAxis,crashSide*roll*Math.PI*.48));
 player.position.x=crashX+crashSide*roll*.15;
 player.position.y=.045+.32*Math.sin(roll*Math.PI/2)+crashStartHeight*Math.max(0,1-crashTime/.45);
 $('vignette').style.opacity=Math.max(0,.8-crashTime*2);
 if(crashTime>=CRASH_DURATION){
  if(falls>=3){finishRun();return;}
  player.position.set(crashX,.045,1.6);player.quaternion.copy(rideYaw);jumpHeight=jumpVelocity=0;invulnerable=2;recoveryTime=0;state='playing';
  // Remove the struck object and leave a short clear run in the recovery lane.
  for(let i=items.length-1;i>=0;i--){const item=items[i];if(item.type!=='seed'&&item.type!=='flock'&&(item.passed||(Math.abs(item.object.position.x-crashX)<1&&item.object.position.z>1.6-7&&item.object.position.z<4))){scene.remove(item.object);disposeGeometry(item.object);items.splice(i,1);}}
  setPanels();notify('På cykeln igen!');updateHud();
 }
}
function steer(dir){if(state==='playing')lane=Math.max(0,Math.min(2,lane+dir*(reverseTime>0?-1:1)));}
function buildWorld(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0xa8dfe0);scene.fog=new THREE.Fog(0xa8dfe0,35,100);
 camera=new THREE.PerspectiveCamera(48,1,.1,150);
 ambientLight=new THREE.HemisphereLight(0xfff9e0,0x6c9852,2.3);scene.add(ambientLight);
 const sun=sunLight=new THREE.DirectionalLight(0xffe9c4,2.8);sun.position.set(-10,22,9);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.normalBias=.04;sun.shadow.bias=-.0001;scene.add(sun);
 const fill=fillLight=new THREE.DirectionalLight(0xc3eeff,.6);fill.position.set(10,7,-10);scene.add(fill);
 const ground=mesh(new THREE.PlaneGeometry(260,240),m.grass,scene,[0,-.065,-65]);ground.rotation.x=-Math.PI/2;ground.castShadow=false;
 const road=mesh(new THREE.PlaneGeometry(7.3,220),m.road,scene,[0,-.025,-75]);road.rotation.x=-Math.PI/2;road.castShadow=false;
 for(const x of [-3.75,3.75]){const e=mesh(new THREE.PlaneGeometry(.25,220),m.edge,scene,[x,-.023,-75]);e.rotation.x=-Math.PI/2;e.castShadow=false;}
 for(let i=0;i<34;i++)for(const x of [-1,1]){const mark=box(.045,.009,1.3,m.white,scene,[x,-.017,9-i*3.5]);mark.castShadow=false;roadMarks.push(mark);}
 const skyCloud=cloudMaterial=new THREE.MeshBasicMaterial({color:0xf3f6da});
 for(let i=0;i<10;i++){const cloud=new THREE.Group();cloud.position.set((i%2?-1:1)*(15+Math.random()*30),11+Math.random()*10,-20-i*9);for(let j=0;j<3;j++)ball(1.6+j*.15,skyCloud,cloud,[j*1.5,Math.sin(j)*.5,0],2);cloud.scale.set(1.8,.55,1);scene.add(cloud);}
 for(let i=0;i<48;i++){
  const group=new THREE.Group();const side=i%2?1:-1;group.position.set(side*(5+Math.random()*16),0,10-i*2.7);
  if(i%3===0){mesh(new THREE.CylinderGeometry(.13,.23,1.5,7),m.wood,group,[0,.75,0]);const crown=ball(1.15,i%2?m.leaf:m.leaf2,group,[0,2.3,0],1);crown.scale.y=1.2;ball(.7,m.leaf2,group,[.6,1.9,.25],1);}
  else if(i%3===1){for(let j=0;j<3;j++){const leaf=ball(.43,m.leaf2,group,[j*.45,.36,0],1);leaf.scale.y=.8;} }
  else {for(let j=0;j<4;j++){const f=new THREE.Group();f.position.set(j*.45,0,Math.sin(j)*.3);mesh(new THREE.CylinderGeometry(.025,.03,.72,5),m.leaf, f,[0,.36,0]);const petal=ball(.19,m.flower,f,[0,.8,0],1);petal.scale.z=.3;const center=ball(.1,m.soil,f,[0,.8,.06],1);center.scale.z=.3;group.add(f);}}
  scene.add(group);scenery.push(group);
 }
 buildSky();
 // Low fence posts provide a clear edge to the cycling path.
 for(let i=0;i<22;i++)for(const side of [-1,1]){const fence=new THREE.Group();fence.position.set(side*4.5,0,10-i*6);box(.12,.8,.12,m.white,fence,[0,.4,0]);box(.065,.09,5.85,m.white,fence,[0,.54,-2.9]);scene.add(fence);scenery.push(fence);}
}
function createSeed(x,z,{dark=false,height=.95,air=false,source=null,flightTime=0,value=1,rocketFlight=false}={}){
 const o=makeSeedVisual(dark);o.position.set(x,height,z);scene.add(o);
 items.push({object:o,previousX:x,previousZ:z,type:'seed',dark,air,baseHeight:height,rampSource:source,flightTime,value,rocketFlight,phase:Math.random()*6,passed:false});
}
function collectSeed(item){
 if(item.passed)return;
 item.passed=true;item.object.visible=false;
 if(item.dark){reverseTime=3;notify('Svart frö! Styrningen är omvänd i 3 sekunder.');}
 else {awardSeeds(item.value||1);burst(item.object.position);}
}
function seedInReach(item){return item.air?jumpHeight>1.65&&Math.abs(jumpHeight+.95-item.object.position.y)<.65:jumpHeight<1.3;}
function handleSwipe(dx,dy){
 if(Math.abs(dy)>Math.abs(dx)){if(dy*(reverseTime>0?-1:1)< -25)jump();}
 else if(Math.abs(dx)>25)steer(dx>0?1:-1);
}
function honk(){
 if(!['playing','sheep'].includes(state)||bellCooldown>0)return;bellCooldown=.45;unlockSound();
 if(audioContext?.state==='suspended')audioContext.resume().then(ringBell).catch(()=>{});else ringBell();
 for(const item of items)if(item.type==='flock'&&!item.passed&&!item.clearing&&item.object.position.z> -65){item.clearing=true;item.clearTime=0;}
 if(state==='sheep')notify('Pling pling! Fåren flyttar på sig.');
}
function createFlock(z){
 const flock=new THREE.Group();
 for(let i=0;i<3;i++){
  const sheep=new THREE.Group();sheep.position.set(lanes[i],0,0);sheep.userData.startX=lanes[i];sheep.userData.side=i===0?-1:1;sheep.userData.legs=[];
  const body=ball(.54,m.wool,sheep,[0,.76,0],2);body.scale.set(.85,.85,1.2);
  for(let j=0;j<8;j++){const t=j*Math.PI/4;ball(.22,m.wool,sheep,[Math.cos(t)*.32,.76+Math.sin(t)*.27,j%2?.24:-.24],1);}
  for(const x of [-.23,.23])for(const z of [-.3,.3]){const leg=box(.12,.43,.13,m.sheepDark,sheep,[x,.24,z]);sheep.userData.legs.push(leg);}
  const head=ball(.25,m.sheepDark,sheep,[0,.85,.56],2);head.scale.set(.7,1.25,1);
  for(const side of [-1,1]){const ear=ball(.14,m.sheepDark,sheep,[side*.22,.97,.52],1);ear.scale.set(1.4,.4,.6);ball(.044,m.white,sheep,[side*.105,.93,.773],1);ball(.022,m.sheepDark,sheep,[side*.105,.93,.810],1);}
  ball(.15,m.wool,sheep,[0,.76,-.69],1);flock.add(sheep);
 }
 flock.position.set(0,0,z);scene.add(flock);items.push({object:flock,type:'flock',clearing:false,clearTime:0,passed:false});
}
function updateSheep(dt){
 for(const item of items){if(item.type!=='flock'||item.passed)continue;
  if(item.clearing){item.clearTime=Math.min(.9,item.clearTime+dt);const t=item.clearTime/.9,u=t*t*(3-2*t);
   item.object.children.forEach((sheep,i)=>{sheep.position.x=THREE.MathUtils.lerp(sheep.userData.startX,sheep.userData.side*(6+i*.6),u);sheep.rotation.y=sheep.userData.side*Math.PI/2;sheep.position.y=Math.abs(Math.sin(t*19))*.055;sheep.userData.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(t*22+j*Math.PI)*.3);});
   if(t>=1){item.passed=true;item.object.visible=false;}
  }
 }
}
function tickSheepWait(dt){
 bellCooldown=Math.max(0,bellCooldown-dt);updateSheep(dt);updateFlightVisuals(dt);tickParticles(dt);
 if(awaitingFlock){awaitingFlock.bumpTime=(awaitingFlock.bumpTime||0)+dt;player.quaternion.copy(rideYaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.sin(Math.min(1,awaitingFlock.bumpTime/.5)*Math.PI)*.18));}
 jumpHeight=Math.max(0,jumpHeight+jumpVelocity*dt-.5*GRAVITY*dt*dt);jumpVelocity=jumpHeight>0?jumpVelocity-GRAVITY*dt:0;player.position.y=.045+jumpHeight;player.visible=true;
 if(awaitingFlock?.passed){awaitingFlock=null;state='playing';recoveryTime=.5;invulnerable=Math.max(invulnerable,1);setPanels();}
 updateHud();
}
function createObstacle(x,z,type){
 const o=new THREE.Group();
 if(type===0){box(.95,.86,.86,m.crate,o,[0,.43,0]);for(const a of [-.3,.3])box(1.005,.07,.91,m.band,o,[0,.43+a,0]);for(const a of [-.25,.25])box(.07,.9,.9,m.band,o,[a,.43,0]);}
 else{const rock=ball(.62,m.stone,o,[0,.36,0],1);rock.scale.set(.9,.8,1);rock.rotation.y=Math.random()*Math.PI;}
 o.position.set(x,0,z);scene.add(o);items.push({object:o,type:'obstacle',height:type===0?.9:.86,passed:false});
}
function createBoulder(x,z){
 const o=new THREE.Group(),radius=1.04;
 const bodyMaterial=m.stone.clone();mesh(new THREE.SphereGeometry(radius,24,16),bodyMaterial,o,[0,0,0]);o.userData.ownedMaterials=[bodyMaterial];
 // Contrasting bands make the actual rolling rotation easy to see.
 for(const tilt of [0,Math.PI/2]){const band=mesh(new THREE.TorusGeometry(radius+.005,.038,8,48),m.band,o,[0,0,0]);band.rotation.y=tilt;}
 o.position.set(x,radius,z);scene.add(o);items.push({object:o,type:'boulder',radius,height:radius*2,rollSpeed:6+distance/2000,bodyMaterial,maneuver:'waiting',warningTime:0,triggerLead:1.35+Math.random()*.6,passed:false});
}


function updateBoulderManeuver(item,dt){
 if(distance<1500||item.passed)return;
 const o=item.object;
 if(item.maneuver==='waiting'){
  const arrival=(1.6-o.position.z)/(speed+item.rollSpeed);
  if(arrival<.85){item.maneuver='done';return;}
  if(arrival>item.triggerLead)return;
  const currentLane=lanes.reduce((best,x,i)=>Math.abs(x-o.position.x)<Math.abs(lanes[best]-o.position.x)?i:best,0);
  const candidates=[currentLane-1,currentLane+1].filter(i=>i>=0&&i<lanes.length&&!items.some(other=>other!==item&&other.type==='boulder'&&Math.abs(other.object.position.x-lanes[i])<.9&&Math.abs(other.object.position.z-o.position.z)<7));
  item.action=Math.random()<.5&&candidates.length?'swerve':'rush';
  if(item.action==='swerve'){item.fromX=o.position.x;item.targetX=lanes[candidates[Math.floor(Math.random()*candidates.length)]];item.swerveTime=0;}
  item.maneuver='warning';item.warningTime=.25;return;
 }
 if(item.maneuver==='warning'){
  item.warningTime=Math.max(0,item.warningTime-dt);item.bodyMaterial.emissive.set(0xff8500);item.bodyMaterial.emissiveIntensity=.6+.5*Math.sin(item.warningTime*50);
  if(item.warningTime>0)return;
  if(item.action==='rush'){item.rollSpeed+=speed*(.65+Math.random()*.5);item.bodyMaterial.emissive.set(0xf05b24);item.bodyMaterial.emissiveIntensity=.35;item.maneuver='done';}
  else item.maneuver='swerving';
 }
 if(item.maneuver==='swerving'){
  item.swerveTime=Math.min(.36,item.swerveTime+dt);const t=item.swerveTime/.36,u=t*t*(3-2*t);o.position.x=THREE.MathUtils.lerp(item.fromX,item.targetX,u);
  if(t>=1){item.bodyMaterial.emissiveIntensity=0;item.maneuver='done';}
 }
}
function sweptItemHit(item,previousPlayerX,halfWidth,halfLength){
 // Intersect horizontal and forward contact intervals to catch swerving at high speed.
 let enter=0,exit=1;
 for(const [a,b,r] of [[item.previousX-previousPlayerX,item.object.position.x-playerX,halfWidth],[item.previousZ-1.6,item.object.position.z-1.6,halfLength]]){
  const change=b-a;if(Math.abs(change)<1e-9){if(Math.abs(a)>r)return false;continue;}
  const t0=(-r-a)/change,t1=(r-a)/change;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));if(enter>exit)return false;
 }
 return true;
}

function createRamp(x,z,rocket=false){
 const o=new THREE.Group(),w=.76,h=.9,l=2;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-w,0,l,w,0,l,-w,0,-l,w,0,-l,-w,h,-l,w,h,-l],3));
 geo.setIndex([0,1,5,0,5,4,0,4,2,1,3,5,2,4,5,2,5,3,0,2,3,0,3,1]);geo.computeVertexNormals();
 mesh(geo,m.ramp,o,[0,0,0]);
 for(const side of [-1,1]){const edge=box(.07,.055,Math.hypot(l*2,h),m.white,o,[side*(w-.07),h/2+.025,0]);edge.rotation.x=Math.atan(h/(2*l));}
 for(const zz of [-.8,.15,1.1])for(const side of [-1,1]){const chevron=box(.055,.035,.48,m.white,o,[side*.15,h*(l-zz)/(2*l)+.035,zz]);chevron.rotation.x=Math.atan(h/(2*l));chevron.rotation.y=side*.7;}
 o.position.set(x,0,z);scene.add(o);const ramp={object:o,type:'ramp',halfLength:l,height:h,rocket,passed:false};items.push(ramp);
 if(rocket){const pickup=makeRocket();pickup.position.set(0,1.75,-1.4);o.add(pickup);return;}
 for(const t of [.25,.38,.51,.64,.77])createSeed(x,z-l-speedAtDistance(distance)*BOOST_FACTOR*t,{height:.95+h+9.5*t-.5*GRAVITY*t*t,air:true,source:ramp,flightTime:t});
}
function activateRamp(item){
 item.passed=true;rampRide=null;jumpHeight=Math.max(jumpHeight,item.height);jumpVelocity=9.5;
 airTricks=0;pendingTrickBonus=0;
 if(item.rocket){startRocket();return;}
 if(boostTime<=0){boostTime=BOOST_DURATION;notify('Ta fröna i luften! Boost i 3 sekunder.');}
 for(const seed of items)if(seed.rampSource===item&&!seed.passed){const t=seed.flightTime,boosted=Math.min(t,boostTime);seed.object.position.z=1.6-speedAtDistance(distance)*(boosted*BOOST_FACTOR+t-boosted);seed.baseHeight=.95+jumpHeight+9.5*t-.5*GRAVITY*t*t;seed.object.position.y=seed.baseHeight;}
}
function updateRampRide(){
 for(const item of items){if(item.type!=='ramp'||item.passed)continue;
  const near=item.object.position.z+item.halfLength,far=item.object.position.z-item.halfLength;
  if(!rampRide&&jumpHeight===0&&Math.abs(item.object.position.x-playerX)<.64&&near>=1.6&&item.previousZ-item.halfLength<=1.6)rampRide=item;
  if(rampRide===item){
   if(Math.abs(item.object.position.x-playerX)>.8){rampRide=null;continue;}
   const u=THREE.MathUtils.clamp((item.object.position.z+item.halfLength-1.6)/(2*item.halfLength),0,1);
   jumpHeight=item.height*u;jumpVelocity=0;player.position.y=.045+jumpHeight;
   if(far>=1.6){activateRamp(item);}
  }
 }
}

function spawnRow(overshoot=0){
 // Keep sheep encounters and ramp flight paths free of overlapping obstacle waves.
 if(rocketTime>0||items.some(i=>(i.type==='flock'&&!i.passed&&!i.clearing)||(i.type==='fork'&&!i.passed)))return;
 rowCount++;
 const ahead=Math.max(55,speed*1.8),z=-ahead+overshoot;
 if(distance>=nextForkDistance&&routeTime<=0){createFork(z);nextForkDistance=distance+1100+Math.random()*350;lastRowDouble=false;return;}
 if(distance>=nextSheepDistance){
  for(let i=items.length-1;i>=0;i--)if(['obstacle','boulder'].includes(items[i].type)&&Math.abs(items[i].object.position.z-z)<25){scene.remove(items[i].object);disposeGeometry(items[i].object);items.splice(i,1);}
  createFlock(z);nextSheepDistance=distance+650+Math.random()*450;lastRowDouble=false;return;
 }
 const blocked=Math.floor(Math.random()*3),second=!lastRowDouble&&Math.random()<secondObstacleChance(distance)*(routeTime>0?(route==='calm'?.5:1.25):1),safe=(blocked+1+Math.floor(Math.random()*2))%3;
 const rampRow=rowCount%4===2||(route==='adventure'&&routeTime>0&&rowCount%4===0);lastRowDouble=second&&!rampRow;
 const boulderChance=.24+.26*distance/(distance+3500);
 if(!rampRow){
  if(distance>1000&&(!firstBoulder||Math.random()<boulderChance)){createBoulder(lanes[blocked],z-10);firstBoulder=true;}
  else createObstacle(lanes[blocked],z,Math.random()<.6?0:1);
  if(second)createObstacle(lanes[3-blocked-safe],z,Math.random()<.6?0:1);
 }
 if(rampRow){const rocket=distance>=nextRocketDistance&&Math.random()<.2;createRamp(lanes[safe],z,rocket);if(rocket)nextRocketDistance=distance+700;}
 else {const count=routeTime>0&&route==='adventure'?6:3,darkIndex=Math.random()<.35?Math.floor(Math.random()*3):-1;for(let i=0;i<count;i++)createSeed(lanes[safe],z-i*2,{dark:i===darkIndex});
 if(distance>=nextPowerDistance){createPower(lanes[safe],z+4);nextPowerDistance=distance+240+Math.random()*220;}}
}
function burst(position){for(let i=0;i<9;i++){const o=ball(.045,m.gold,scene,position.toArray(),0);particles.push({object:o,velocity:new THREE.Vector3((Math.random()-.5)*3,1+Math.random()*3,(Math.random()-.5)*3),life:.65});}}
function tickGame(dt){
 elapsed+=dt;recoveryTime+=dt;tickPowers(dt);bellCooldown=Math.max(0,bellCooldown-dt);reverseTime=Math.max(0,reverseTime-dt);if(reverseTime<1e-8)reverseTime=0;
 boostTime=Math.max(0,boostTime-dt);if(boostTime<1e-8)boostTime=0;
 const targetSpeed=speedAtDistance(distance);speed=targetSpeed*(rocketTime>0?1.25:boostTime>0?BOOST_FACTOR:1)*(slowTime>0?.65:1)*Math.min(1,.35+recoveryTime/1.25*.65);
 const blockingFlock=items.filter(i=>i.type==='flock'&&!i.passed&&!i.clearing).sort((a,b)=>b.object.position.z-a.object.position.z)[0];
 let stoppedForSheep=false;
 if(blockingFlock){const remaining=Math.max(0,-1.2-blockingFlock.object.position.z);if(speed*dt>=remaining){speed=remaining/dt;stoppedForSheep=true;}}
 distance+=speed*dt;checkHighscore();spawnTimer-=speed*dt;invulnerable=Math.max(0,invulnerable-dt);
 if(distance>1000&&!klotNotice){klotNotice=true;notify('1 000 meter! Väj för de rullande kloten.');feedbackTime=3;}
 const wasAirborne=jumpHeight>0;
 if(rocketTime>0){rocketTime=Math.max(0,rocketTime-dt);if(rocketTime<1e-8)rocketTime=0;jumpHeight=rocketHeight(5-rocketTime);jumpVelocity=0;if(rocketTime===0){invulnerable=Math.max(invulnerable,.9);spawnTimer=Math.max(spawnTimer,speed*.8);}}
 else if(!rampRide){jumpHeight=Math.max(0,jumpHeight+jumpVelocity*dt-.5*GRAVITY*dt*dt);if(jumpHeight>0)jumpVelocity-=GRAVITY*dt;else jumpVelocity=0;}
 tickTrick(dt);
 updateFlightVisuals(dt);
 const previousPlayerX=playerX;playerX=THREE.MathUtils.damp(playerX,lanes[lane],12,dt);const turn=lanes[lane]-playerX;
 player.position.set(playerX,.045+jumpHeight+(jumpHeight===0?Math.sin(elapsed*12)*.014:0),1.6);
 player.quaternion.copy(rideYaw).multiply(rollQuaternion.setFromAxisAngle(rollAxis,-turn*.14));
 if(chicken)chicken.rotation.z=Math.sin(elapsed*7)*.015;
 wheels.forEach(w=>w.rotation.z-=speed*dt/.64);player.visible=invulnerable<=0||Math.floor(invulnerable*9)%2===0;

 moveWorld(speed*dt);
 // Move the whole row before resolving a hit, so the frozen scene stays coherent.
 for(const item of items){const o=item.object;item.previousZ=o.position.z;item.previousX=o.position.x;if(item.pulling&&!item.passed){tickSuction(item,dt);continue;}if(item.type==='boulder')updateBoulderManeuver(item,dt);const travel=(speed+(item.rollSpeed||0))*dt;o.position.z+=travel;
  if(item.rocketFlight&&rocketTime>0)o.position.z=1.6-speed*(item.flightTime-(5-rocketTime));
  if(item.type==='seed'){o.rotation.y+=dt*1.4;o.position.y=item.baseHeight+(item.air?0:Math.sin(elapsed*3+item.phase)*.1);}
  if(item.type==='boulder')o.rotation.x+=travel/item.radius;
 }
 updateSheep(dt);updateRampRide();updateForks();
 for(const item of items){
  if(['ramp','flock','fork'].includes(item.type))continue;
  if(item.pulling)continue;
  if(canMagnetPull(item)){beginSuction(item);continue;}
  const o=item.object,dx=Math.abs(o.position.x-playerX),reach=item.type==='seed'?.75:item.type==='boulder'?1.55:1.04;
  // Sweep both axes so an unexpected lane change cannot pass through the rider.
  const overlaps=sweptItemHit(item,previousPlayerX,item.type==='boulder'?1.22:.7,reach);
  if(!item.passed&&overlaps){
   if(item.type==='seed'){if(seedInReach(item))collectSeed(item);}
   else if(item.type==='power'){if(jumpHeight<1.3){takePower(item);}}
   else if(shieldTime>0&&!canJumpOver(item,jumpHeight)){shieldTime=0;item.passed=true;item.object.visible=false;invulnerable=Math.max(invulnerable,.8);notify('Skyddsbubblan tog smällen!');}
   else if(invulnerable<=0&&!canJumpOver(item,jumpHeight)){crash(item);break;}
  }
 }
 if(wasAirborne&&jumpHeight===0&&!rampRide&&state==='playing')landTricks();
 if(stoppedForSheep&&state==='playing'){if(rocketTime>0){resetAir();jumpVelocity=0;}state='sheep';speed=0;awaitingFlock=blockingFlock;hitSheep(blockingFlock);setPanels();}
 if(state==='playing')while(spawnTimer<=0){spawnRow(-spawnTimer);spawnTimer+=obstacleGap(distance)*(routeTime>0?(route==='calm'?1.35:.85):1);}
 for(let i=items.length-1;i>=0;i--)if(items[i].object.position.z>13||(['seed','flock','power'].includes(items[i].type)&&items[i].passed)){scene.remove(items[i].object);disposeGeometry(items[i].object);items.splice(i,1);}
 tickParticles(dt);
 updateHud();
}
function disposeGeometry(obj){obj.traverse(o=>{if(o.geometry)o.geometry.dispose();for(const material of o.userData.ownedMaterials||[])material.dispose();});}
function moveWorld(amount){for(const o of scenery){o.position.z+=amount;if(o.position.z>18)o.position.z-=132;}for(const o of roadMarks){o.position.z+=amount;if(o.position.z>12)o.position.z-=119;}}
function resize(){const w=ui.game.clientWidth,h=ui.game.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<700?56:48;camera.updateProjectionMatrix();}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.045);
 if(state==='playing')tickGame(dt);
 else if(state==='crashing')tickCrash(dt);
 else if(state==='sheep')tickSheepWait(dt);
 else if(state==='ready'||state==='loading'){elapsed+=dt;moveWorld(dt*.65);if(player){player.position.y=.04+Math.sin(elapsed*2)*.012;wheels.forEach(w=>w.rotation.z-=dt*.8);}}
 if(state==='over'&&endScene){renderEndScene(dt);return;}
 if(feedbackTime>0){feedbackTime-=dt;if(feedbackTime<=0)$('feedback').classList.remove('visible');}
 const mobile=camera.aspect<.95;
 if(['loading','ready'].includes(state)){
  // Side view on the start screen; the same character turns toward the path during play.
  const targetPos=mobile?new THREE.Vector3(5,3.4,6):new THREE.Vector3(6,3.4,6.8);
  camera.position.lerp(targetPos,1-Math.exp(-3*dt));camera.lookAt(mobile?-1.8:-2.3,mobile?2.4:1.05,0);
 }else{const targetPos=new THREE.Vector3(playerX*.28,4.3+jumpHeight*.6,mobile?10.5:9.3);camera.position.lerp(targetPos,1-Math.exp(-4*dt));camera.lookAt(playerX*.13,1.0+jumpHeight*.65,-8);}
 renderer.setViewport(0,0,ui.game.clientWidth,ui.game.clientHeight);updateWeather();renderer.render(scene,camera);
}
async function init(){
 try{
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('world').appendChild(renderer.domElement);
 buildWorld();camera.position.set(6,3.4,6.8);resize();window.addEventListener('resize',resize);animate();
 const gltf=await new GLTFLoader().loadAsync('./assets/kyckling-cykel.glb');
 const source=gltf.scene;source.updateMatrixWorld(true);const chick=source.getObjectByName('Kyckling'),bike=source.getObjectByName('Cykel');if(!chick||!bike)throw new Error('Modelldel saknas');
 player=new THREE.Group();cyclist=new THREE.Group();player.add(cyclist);scene.add(player);
 // Retain the source mesh geometry and materials; recenter each original model.
 cyclist.add(bike);const chickCentered=new THREE.Group();chickCentered.add(chick);chick.position.x=1.2;
 chicken=new THREE.Group();chicken.add(chickCentered);chicken.scale.setScalar(.46);chicken.rotation.y=Math.PI/2;chicken.position.set(1.65,1.51,0);cyclist.add(chicken);
 for(const [name,x]of[['bakhjul',1.05],['framhjul',3.02]]){
  const pivot=new THREE.Group();pivot.position.set(x,.64,0);bike.add(pivot);bike.updateMatrixWorld(true);
  const members=[];bike.traverse(o=>{if(o.isMesh&&o.name.includes(name))members.push(o);});for(const o of members)pivot.attach(o);wheels.push(pivot);
 }
 buildEndScene(chick);prepareWings(chick);prepareEquipment();addFlightVisuals();addHeadlight();cyclist.position.x=-1.91;player.rotation.y=Math.PI/2;player.position.set(0,.04,1.6);
 player.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 ui.best.textContent=highscore;$('intro-best').textContent=highscore;state='ready';ui.start.disabled=false;ui.start.textContent='Börja cykla';setPanels();
 }catch(error){state='error';ui.intro.hidden=false;ui.start.disabled=false;ui.start.textContent='Försök igen';$('load-error').hidden=false;$('load-error').textContent='Spelet kunde inte laddas. Kontrollera anslutningen och försök igen.';console.error(error);}
}
ui.start.addEventListener('click',()=>state==='error'?location.reload():start());$('restart').addEventListener('click',start);$('end-restart').addEventListener('click',start);$('bell').addEventListener('click',e=>{honk();e.currentTarget.blur();});$('jump').addEventListener('click',e=>{jump();e.currentTarget.blur();});ui.pause.addEventListener('click',pause);$('resume').addEventListener('click',pause);$('left').addEventListener('pointerdown',e=>{e.preventDefault();steer(-1);});$('right').addEventListener('pointerdown',e=>{e.preventDefault();steer(1);});
window.addEventListener('keydown',e=>{
 if(shopOpen)return;
 if(e.key.toLowerCase()==='r'&&!e.repeat){honk();return;}
 if(e.target instanceof HTMLElement&&e.target.closest('button,a,input,select,textarea,summary')){if(e.key==='Escape')pause();return;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Escape'].includes(e.key))e.preventDefault();if(e.repeat)return;
 if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')steer(-1);if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')steer(1);
 if(e.key==='Escape'||e.key.toLowerCase()==='p')pause();
 if(e.key.toLowerCase()==='t'){doTrick();return;}
 if(e.key===(reverseTime>0?'ArrowDown':'ArrowUp'))jump();
 if(e.key===' '){if(state==='playing')jump();else if(state==='ready'||state==='over')start();else if(state==='paused')pause();}
 if(e.key==='Enter'&&(state==='ready'||state==='over'))start();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){saveHighscore();if(state==='playing'||state==='crashing'||state==='sheep')pause();}});
let touchStart=null;$('world').addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY};});$('world').addEventListener('pointerup',e=>{if(touchStart){const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;handleSwipe(dx,dy);touchStart=null;}});
window.addEventListener('pagehide',()=>{saveHighscore();backgroundMusic.pause();});
$('music-toggle').addEventListener('click',toggleMusic);
$('music-volume').addEventListener('input',e=>setMusicVolume(e.target.value));
// Adventure expansion: active-play timers, cosmetic equipment and alternate routes.
let rocketTime=0,nextRocketDistance=250,magnetTime=0,shieldTime=0,slowTime=0,nextPowerDistance=160;
let route=null,routeTime=0,nextForkDistance=600,selectedRoute=null,trickTime=0,airTricks=0,pendingTrickBonus=0;
let flightRocket=null,shieldBubble=null,wingSpread=0,wingPivots=[],gearMeshes=[],shopOpen=false,shopPaused=false;
const GEAR_KEY='kycklingcykeln.equipment.v1';
const equipment=[
 {id:'helmet-original',kind:'helmet',name:'Originalhjälm',cost:0,color:0x647342},
 {id:'helmet-red',kind:'helmet',name:'Röd racerhjälm',cost:80,color:0xf05642},
 {id:'helmet-gold',kind:'helmet',name:'Guldhjälm',cost:220,color:0xffc52f},
 {id:'bike-original',kind:'bike',name:'Turkos cykel',cost:0,color:0x239c9a},
 {id:'bike-blue',kind:'bike',name:'Blå blixten',cost:120,color:0x3976f5},
 {id:'bike-pink',kind:'bike',name:'Rosa raketen',cost:180,color:0xed489e}
];
let gear=loadGear(),storageFailed=false;
function loadGear(){
 const fallback={bank:0,owned:['helmet-original','bike-original'],helmet:'helmet-original',bike:'bike-original'};
 try{const data=JSON.parse(localStorage.getItem(GEAR_KEY));if(!data)return fallback;
 const owned=[...new Set([...fallback.owned,...(Array.isArray(data.owned)?data.owned:[]).filter(id=>equipment.some(e=>e.id===id))])];
 return {bank:Number.isSafeInteger(data.bank)&&data.bank>=0?data.bank:0,owned,
 helmet:owned.includes(data.helmet)&&equipment.some(e=>e.id===data.helmet&&e.kind==='helmet')?data.helmet:fallback.helmet,
 bike:owned.includes(data.bike)&&equipment.some(e=>e.id===data.bike&&e.kind==='bike')?data.bike:fallback.bike};}catch{return fallback;}
}
function saveGear(){try{localStorage.setItem(GEAR_KEY,JSON.stringify(gear));storageFailed=false;}catch{storageFailed=true;}}
function awardSeeds(count){seeds+=count;gear.bank+=count;saveGear();}
function buyEquipment(id){
 const e=equipment.find(e=>e.id===id);if(!e)return false;
 if(!gear.owned.includes(id)){if(gear.bank<e.cost)return false;gear.bank-=e.cost;gear.owned.push(id);}
 gear[e.kind]=id;saveGear();applyEquipment();renderShop();return true;
}
function prepareEquipment(){
 player.traverse(o=>{if(!o.isMesh||!o.material?.name)return;
 const kind=o.material.name==='Hjalm - olivgron'?'helmet':o.material.name==='Cykel - turkos lack'?'bike':null;
 if(kind){o.material=o.material.clone();gearMeshes.push({mesh:o,kind,original:o.material.color.clone()});}
 });applyEquipment();
}
function applyEquipment(){for(const {mesh,kind,original} of gearMeshes){const e=equipment.find(e=>e.id===gear[kind]);if(e?.cost===0)mesh.material.color.copy(original);else if(e)mesh.material.color.set(e.color);}}
function renderShop(){
 $('seed-bank').textContent=gear.bank;
 $('shop-status').textContent=storageFailed?'Webbläsaren kunde inte spara. Utrustningen finns kvar under den här spelsessionen.':'Frön och utrustning sparas i den här webbläsaren. Färgerna ändrar inte farten.';
 $('equipment-list').innerHTML=equipment.map(e=>{const owned=gear.owned.includes(e.id),active=gear[e.kind]===e.id;return `<button type="button" data-equipment="${e.id}" aria-pressed="${active}" ${!owned&&gear.bank<e.cost?'disabled':''}><span class="gear-swatch" style="background:#${e.color.toString(16).padStart(6,'0')}"></span><strong>${e.name}</strong><span>${active?'Vald':owned?'Välj':e.cost+' frön · Lås upp'}</span></button>`;}).join('');
}
function openShop(){
 if(shopOpen)return;shopPaused=['playing','crashing','sheep'].includes(state);if(shopPaused)pause();shopOpen=true;
 renderShop();$('equipment-panel').hidden=false;ui.paused.hidden=true;$('equipment-close').focus();
}
function closeShop(){shopOpen=false;$('equipment-panel').hidden=true;if(shopPaused&&state==='paused')pause();else setPanels();if(['playing','crashing','sheep'].includes(state))document.activeElement?.blur();else $('equipment-open').focus();}
function resetAir(){rocketTime=0;trickTime=0;airTricks=0;pendingTrickBonus=0;if(cyclist)cyclist.rotation.x=0;if(flightRocket)flightRocket.visible=false;}
function resetAdventure(){if(magnetAura)magnetAura.visible=false;resetAir();magnetTime=shieldTime=slowTime=0;route=null;routeTime=0;selectedRoute=null;nextRocketDistance=250;nextPowerDistance=160;nextForkDistance=600;wingSpread=0;for(const w of wingPivots)w.pivot.rotation.z=0;if(shieldBubble)shieldBubble.visible=false;}
function prepareWings(chick){
 chick.updateWorldMatrix(true,true);
 for(const [prefix,side] of [['Vanster',-1],['Hoger',1]]){
 const members=[];chick.traverse(o=>{if(o.isMesh&&o.name.startsWith(prefix)&&o.name.includes('ving'))members.push(o);});
 const pivot=new THREE.Group();pivot.position.set(-1.2+side*.54,1.7,0);chick.add(pivot);chick.updateWorldMatrix(true,true);
 for(const o of members)pivot.attach(o);wingPivots.push({pivot,side});
 }
}
function makeRocket(){
 const group=new THREE.Group();
 const body=mesh(new THREE.CylinderGeometry(.19,.23,.85,16),m.white,group,[0,0,0]);
 mesh(new THREE.ConeGeometry(.20,.4,16),m.ramp,group,[0,.61,0]);
 for(const side of [-1,1]){const fin=box(.10,.35,.3,m.ramp,group,[side*.25,-.35,0]);fin.rotation.z=-side*.4;}
 const flame=mesh(new THREE.ConeGeometry(.15,.55,12),m.gold,group,[0,-.65,0]);flame.rotation.z=Math.PI;group.userData.flame=flame;
 const rim=mesh(new THREE.TorusGeometry(.34,.035,8,24),m.gold,group,[0,.05,0]);rim.rotation.x=Math.PI/2;
 return group;
}
function addFlightVisuals(){
 magnetAura=new THREE.Group();magnetAura.position.set(-.26,2.1,0);player.add(magnetAura);magnetAura.visible=false;
 for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.7+i*.23,.022,6,40,Math.PI*1.5),new THREE.MeshBasicMaterial({color:0xff82db,transparent:true,opacity:.8-i*.15,depthWrite:false}),magnetAura,[0,0,i*.12]);ring.rotation.y=Math.PI/2+i*.15;}
 flightRocket=makeRocket();flightRocket.position.set(1.48,1.85,-.42);flightRocket.rotation.z=-Math.PI/2;flightRocket.visible=false;cyclist.add(flightRocket);
 shieldBubble=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshStandardMaterial({color:0x70ddff,transparent:true,opacity:.2,roughness:.15,depthWrite:false}));shieldBubble.position.set(0,1.15,0);shieldBubble.scale.set(1.35,1.5,1.8);shieldBubble.visible=false;player.add(shieldBubble);
}
function rocketHeight(t){const smooth=u=>{u=THREE.MathUtils.clamp(u,0,1);return u*u*(3-2*u);};return t<.65?.9+3.1*smooth(t/.65):t>4.25?4*(1-smooth((t-4.25)/.75)):4;}
function startRocket(){
 rocketTime=5;boostTime=0;jumpVelocity=0;airTricks=0;pendingTrickBonus=0;
 // Air trails use time-to-contact, so distance speed tiers and powers cannot make them unreachable.
 for(const point of rocketTrail(lane)){const t=point.time;createSeed(lanes[point.lane],1.6-speed*t,{height:4.95,air:true,flightTime:t,value:3,rocketFlight:true});}
 notify('Raket! Följ fröspåret · det kan byta fil · T gör trick');feedbackTime=3;
}
function updateFlightVisuals(dt){
 if(magnetAura){magnetAura.visible=magnetTime>0;magnetAura.children.forEach((ring,i)=>{ring.scale.setScalar(1+Math.sin(elapsed*5-i*1.5)*.18);ring.rotation.z=elapsed*(i%2?1:-1);});}
 ui.game.classList.toggle('magnet-active',magnetTime>0);
 wingSpread=THREE.MathUtils.damp(wingSpread,rocketTime>0?1:0,9,dt);
 for(const {pivot,side} of wingPivots)pivot.rotation.z=side*wingSpread*(1.30+Math.sin(elapsed*9)*.08);
 if(flightRocket){flightRocket.visible=rocketTime>0;flightRocket.userData.flame.scale.y=.8+Math.sin(elapsed*35)*.2;}
 if(shieldBubble){shieldBubble.visible=shieldTime>0;shieldBubble.material.opacity=.17+Math.sin(elapsed*4)*.04;}
}
function remainingAirTime(){return rocketTime>0?rocketTime:(jumpVelocity+Math.sqrt(jumpVelocity*jumpVelocity+2*GRAVITY*jumpHeight))/GRAVITY;}
function canTrick(){return state==='playing'&&!rampRide&&jumpHeight>.65&&remainingAirTime()>.7&&trickTime===0&&airTricks<(rocketTime>0?3:1);}
function doTrick(){if(!canTrick())return;trickTime=.6;airTricks++;notify('Luftvolt! Landa för +10 frön.');}
function tickTrick(dt){if(trickTime<=0)return;trickTime=Math.max(0,trickTime-dt);if(trickTime<1e-8)trickTime=0;if(cyclist)cyclist.rotation.x=(1-trickTime/.6)*Math.PI*2;if(trickTime===0){if(cyclist)cyclist.rotation.x=0;pendingTrickBonus+=10;}}
function landTricks(){if(pendingTrickBonus>0){awardSeeds(pendingTrickBonus);notify('Snygg landning! +'+pendingTrickBonus+' bonusfrön');}trickTime=0;pendingTrickBonus=0;airTricks=0;if(cyclist)cyclist.rotation.x=0;}
const powerNames={magnet:'Frömagnet',shield:'Skyddsbubbla',slow:'Slowmotion'};
const powerMaterials={magnet:mat(0xec72ca),shield:mat(0x55c9fb),slow:mat(0x9876ed)};
function createPower(x,z,kind=['magnet','shield','slow'][Math.floor(Math.random()*3)]){
 const group=new THREE.Group(),material=powerMaterials[kind];
 mesh(new THREE.OctahedronGeometry(.47),material,group,[0,0,0]);
 if(kind==='magnet'){
 const u=mesh(new THREE.TorusGeometry(.24,.07,8,20,Math.PI),m.white,group,[0,0,.39]);u.rotation.z=Math.PI;
 for(const side of [-1,1])box(.13,.22,.1,m.white,group,[side*.24,.1,.39]);
 }else if(kind==='shield'){const ring=mesh(new THREE.TorusGeometry(.24,.065,8,24),m.white,group,[0,0,.39]);ring.scale.y=1.2;}
 else {mesh(new THREE.TorusGeometry(.26,.04,8,24),m.white,group,[0,0,.39]);box(.035,.20,.06,m.white,group,[0,.08,.43]);box(.16,.035,.06,m.white,group,[.06,0,.43]);}
 group.position.set(x,.95,z);scene.add(group);items.push({object:group,type:'power',kind,passed:false});
}
function takePower(item){item.passed=true;item.object.visible=false;if(item.kind==='magnet')magnetTime=8;if(item.kind==='shield')shieldTime=12;if(item.kind==='slow')slowTime=5;notify(powerNames[item.kind]+'! '+(item.kind==='shield'?'Skyddar mot en krock i 12 s':item.kind==='magnet'?'Drar till sig gula frön i 8 s':'Lugnare tempo i 5 s'));}
function tickPowers(dt){magnetTime=Math.max(0,magnetTime-dt);shieldTime=Math.max(0,shieldTime-dt);slowTime=Math.max(0,slowTime-dt);routeTime=Math.max(0,routeTime-dt);if(routeTime===0)route=null;}
function createFork(z){
 const group=new THREE.Group();
 // Two separate colored road entrances divide around a grassy median.
 for(const side of [-1,1]){
 const material=side<0?m.ramp:m.gold;
 const strip=box(2.9,.025,15,material,group,[side*1.9,.005,-5]);
 for(const dx of [-1.32,1.32])box(.09,2.3,.09,material,group,[side*1.9+dx,1.15,0]);
 box(2.8,.2,.14,material,group,[side*1.9,2.3,0]);
 for(const a of [-1,1]){const arrow=box(.10,.04,.65,m.white,group,[side*1.9+a*.20,.04,1]);arrow.rotation.y=a*.65;}
 }
 box(.45,.04,12,m.grass,group,[0,.015,-5]);group.position.z=z;scene.add(group);items.push({object:group,type:'fork',passed:false});selectedRoute=null;
}
function chooseRoute(value){if(state!=='playing'||!items.some(i=>i.type==='fork'&&!i.passed))return;selectedRoute=value;lane=value==='calm'?0:2;}
function updateForks(){for(const item of items){if(item.type!=='fork'||item.passed)continue;if(item.object.position.z>=1.6){item.passed=true;route=playerX>.2?'adventure':'calm';routeTime=12;selectedRoute=null;spawnTimer=0;notify(route==='calm'?'Lugna vägen · glesare hinder i 12 s':'Äventyrsvägen · fler frön, ramper och hinder i 12 s');}}}
function updateAdventureHud(){
 const active=['playing','sheep','crashing','paused'].includes(state);
 $('flight-status').hidden=!active||rocketTime<=0;$('flight-status').textContent='RAKET · '+rocketTime.toFixed(1)+' s · luftfrön ger 3 poäng';
 const powers=[magnetTime>0?'Magnet '+magnetTime.toFixed(1)+' s':'',shieldTime>0?'Skydd '+shieldTime.toFixed(1)+' s':'',slowTime>0?'Slowmotion '+slowTime.toFixed(1)+' s':'',routeTime>0?(route==='calm'?'Lugna vägen ':'Äventyrsvägen ')+routeTime.toFixed(0)+' s':''].filter(Boolean);
 $('power-status').hidden=!active||powers.length===0;$('power-status').textContent=powers.join(' · ');
 $('trick').disabled=!canTrick();$('trick-status').hidden=!active||pendingTrickBonus<=0;$('trick-status').textContent='Landa för +'+pendingTrickBonus+' frön';
 const fork=items.find(i=>i.type==='fork'&&!i.passed);$('route-choice').hidden=state!=='playing'||!fork;
 if(fork)$('route-countdown').textContent='Välj fil före porten · '+Math.max(0,(1.6-fork.object.position.z)/Math.max(1,speed)).toFixed(1)+' s';
 $('route-calm').setAttribute('aria-pressed',String(lane===0));$('route-adventure').setAttribute('aria-pressed',String(lane===2));
}
$('trick').addEventListener('click',e=>{doTrick();e.currentTarget.blur();});
$('route-calm').addEventListener('click',e=>{chooseRoute('calm');e.currentTarget.blur();});
$('route-adventure').addEventListener('click',e=>{chooseRoute('adventure');e.currentTarget.blur();});
$('equipment-open').addEventListener('click',openShop);$('equipment-close').addEventListener('click',closeShop);
$('equipment-list').addEventListener('click',e=>{const button=e.target.closest('[data-equipment]');if(button)buyEquipment(button.dataset.equipment);});
$('equipment-panel').addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeShop();return;}
 if(e.key==='Tab'){const controls=[...$('equipment-panel').querySelectorAll('button:not(:disabled)')];const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});

// One continuous airborne trail, optionally handed over to one neighboring lane.
function rocketTrail(startLane,change=Math.random()<.55){
 const other=startLane===0?1:startLane===2?1:(Math.random()<.5?0:2);
 return Array.from({length:18},(_,n)=>({lane:change&&n>=9?other:startLane,time:.7+n*.18+(change&&n>=9?.45:0)}));
}
function makeSeedVisual(dark=false){const o=new THREE.Group();const seed=ball(.24,dark?m.blackSeed:m.gold,o,[0,0,0],2);seed.scale.set(.67,1.2,.48);const stripe=ball(.19,dark?m.blackStripe:m.stripe,o,[0,0,.105],1);stripe.scale.set(.11,1.15,.14);return o;}
function hitSheep(flock){
 if(!flock||flock.penalized)return;flock.penalized=true;flock.bumpTime=0;
 const lost=Math.min(50,seeds);seeds-=lost;gear.bank=Math.max(0,gear.bank-lost);saveGear();
 for(let i=0;i<lost;i++){
  const o=makeSeedVisual();o.position.set(playerX,1.2,1.6);o.scale.setScalar(.65);scene.add(o);
  const angle=Math.random()*Math.PI*2,v=2+Math.random()*3;
  particles.push({object:o,velocity:new THREE.Vector3(Math.cos(angle)*v,3+Math.random()*4,Math.sin(angle)*v),life:2.7,spill:true});
 }
 notify(lost?'Fårkrock! −'+lost+' frön · Ring med R för att fortsätta.':'Fårkrock! Inga frön kvar att tappa · Ring med R.');feedbackTime=3;
}
function tickParticles(dt){
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=(p.spill?11:5)*dt;p.object.position.addScaledVector(p.velocity,dt);
  if(p.spill){if(p.object.position.y<.14){p.object.position.y=.14;p.velocity.y=Math.abs(p.velocity.y)*.53;p.velocity.x*=.72;p.velocity.z*=.72;}p.object.rotation.x+=dt*5;p.object.rotation.z+=dt*3;p.object.scale.setScalar(.65*Math.min(1,Math.max(.01,p.life/.5)));}
  else p.object.scale.setScalar(Math.max(.01,p.life/.65));
  if(p.life<=0){scene.remove(p.object);disposeGeometry(p.object);particles.splice(i,1);}
 }
}
let magnetAura=null;
function canMagnetPull(item){return item.type==='seed'&&!item.passed&&!item.pulling&&!item.dark&&magnetTime>0&&item.object.position.z<4&&item.object.position.z>1.6-Math.max(12,Math.min(28,speed*.65))&&Math.abs(item.object.position.y-(jumpHeight+.95))<1.6;}
function beginSuction(item){if(item.pulling||item.passed)return;item.pulling=true;item.pullTime=0;item.pullFrom=item.object.position.clone();item.pullDuration=.48;}
function magnetTarget(){if(chicken?.parent){chicken.updateWorldMatrix(true,false);return chicken.localToWorld(new THREE.Vector3(0,1.3,0));}return new THREE.Vector3(playerX,jumpHeight+2.1,1.6);}
function tickSuction(item,dt){
 item.pullTime=Math.min(item.pullDuration,item.pullTime+dt);const t=item.pullTime/item.pullDuration,u=t*t;
 const target=magnetTarget();
 item.object.position.lerpVectors(item.pullFrom,target,u);item.object.position.y+=Math.sin(t*Math.PI)*.5;item.object.rotation.x+=dt*8;item.object.scale.setScalar(1-.5*u);
 if(t>=1)collectSeed(item);
}
let endScene=null,endCamera=null,endChicken=null,endHelmet=null;
function rodBetween(a,b,r,material,parent){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);const o=mesh(new THREE.CylinderGeometry(r,r,start.distanceTo(end),12),material,parent,start.clone().add(end).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return o;}
function buildEndScene(source){
 endScene=new THREE.Scene();endScene.background=new THREE.Color(0xd9efe5);
 endCamera=new THREE.PerspectiveCamera(35,1,.1,40);endCamera.position.set(0,1.9,7.6);endCamera.lookAt(0,1.55,0);
 endScene.add(new THREE.HemisphereLight(0xfffaf0,0x63938b,2.8));const key=new THREE.DirectionalLight(0xffefd1,3);key.position.set(-3,6,5);endScene.add(key);const fill=new THREE.DirectionalLight(0xe0efff,1.5);fill.position.set(4,3,1);endScene.add(fill);
 endChicken=source.clone(true);endChicken.position.set(1.2,0,0);endChicken.rotation.set(0,0,0);endChicken.scale.setScalar(1);endScene.add(endChicken);
 endChicken.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();
  if(o.material.name==='Hjalm - olivgron'){
   endHelmet=o;o.geometry=o.geometry.clone();o.material.side=THREE.DoubleSide;
   const g=o.geometry,positions=g.attributes.position,indices=g.index?Array.from(g.index.array):Array.from({length:positions.count},(_,i)=>i),kept=[];
   // A missing jagged front-right section of the helmet, confined to the helmet shell.
   for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),x=ids.reduce((v,n)=>v+positions.getX(n),0)/3+1.2,y=ids.reduce((v,n)=>v+positions.getY(n),0)/3,z=ids.reduce((v,n)=>v+positions.getZ(n),0)/3;
    if(!(z>.2&&x>.12&&x<.48+.045*Math.sin(y*45)&&y>2.7))kept.push(...ids);
   }g.setIndex(kept);g.computeVertexNormals();
  }
 });
 // White gauze wraps the left knee; diagonal seams make the bandage readable.
 const gauze=mat(0xfffcf0),seam=mat(0xbac7c4),rubber=mat(0x365b59),aluminum=mat(0x9fbdbf,.3);
 const knee=mesh(new THREE.CylinderGeometry(.15,.15,.28,24),gauze,endChicken,[-1.51,.44,.065]);knee.rotation.z=-.08;
 for(let i=0;i<4;i++){const wrap=mesh(new THREE.TorusGeometry(.153,.015,6,24),seam,endChicken,[-1.51,.34+i*.065,.065]);wrap.rotation.x=Math.PI/2;wrap.rotation.z=.12;}
 box(.11,.12,.018,gauze,endChicken,[-1.51,.44,.224]);
 // A full underarm crutch rests beside the wing and reaches the floor.
 const crutch=new THREE.Group();crutch.name='RecoveryCrutch';endChicken.add(crutch);
 rodBetween([-.20,.12,.22],[-.31,1.55,.18],.044,aluminum,crutch);
 rodBetween([-.20,.68,.22],[-.66,1.55,.18],.044,aluminum,crutch);
 rodBetween([-.70,1.57,.18],[-.26,1.57,.18],.085,rubber,crutch);
 rodBetween([-.48,1.05,.20],[-.26,1.05,.20],.055,rubber,crutch);
 mesh(new THREE.CylinderGeometry(.095,.11,.15,16),rubber,crutch,[-.20,.09,.22]);
 // Dark fracture lines follow the front of the shell, separate from the missing piece.
 const crackMat=mat(0x293c39);const cracks=[[-1.36,3.13,.20],[-1.26,3.035,.40],[-1.34,2.93,.54],[-1.20,2.82,.62]];
 for(let i=1;i<cracks.length;i++)rodBetween(cracks[i-1],cracks[i],.022,crackMat,endChicken);
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.1,48),new THREE.MeshBasicMaterial({color:0x8bb6a5,transparent:true,opacity:.38}));shadow.rotation.x=-Math.PI/2;shadow.position.set(.1,.012,.08);shadow.scale.set(1,.7,1);endScene.add(shadow);
}
function syncEndEquipment(){if(endHelmet){const e=equipment.find(e=>e.id===gear.helmet);endHelmet.material.color.set(e?.color||0x647342);}}
function renderEndScene(dt){
 const w=ui.game.clientWidth,h=ui.game.clientHeight,mobile=w<761;
 renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);renderer.setClearColor(endScene.background);renderer.clear();
 const viewport=mobile?{x:0,y:h*.45,w,h:h*.48}:{x:w*.48,y:h*.08,w:w*.50,h:h*.79};
 endCamera.aspect=viewport.w/viewport.h;endCamera.updateProjectionMatrix();
 renderer.setViewport(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissor(viewport.x,viewport.y,viewport.w,viewport.h);renderer.setScissorTest(true);renderer.render(endScene,endCamera);renderer.setScissorTest(false);
}

init();
