import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createParkSimulation } from './simulation.js?v=staff-lanes-11';
import { createCounterLayouts } from './stall-layout.js?v=queue-forward-4';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// New gameplay implementation. Visual resources are attributed in assets/REFERENCE.json.
const $=id=>document.getElementById(id);
const scene=new THREE.Scene();
scene.background=new THREE.Color('#b1db42');
const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.1,160);
const cameraFocus=new THREE.Vector3(0,0,-5.2);
const cameraBase=new THREE.Vector3(0,17,13.8);
camera.position.copy(cameraBase);
camera.lookAt(cameraFocus);
scene.add(new THREE.AmbientLight(0xffffff,1));
const hemi=new THREE.HemisphereLight(0x757575,0xfebb7c,5.4);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,4);sun.position.set(.05,10,8);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.far=65;sun.shadow.bias=-.00025;sun.shadow.normalBias=.025;sun.shadow.radius=2;sun.target.position.set(0,0,0);scene.add(sun,sun.target);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial({color:0xb0d643}));floor.rotation.x=-Math.PI/2;floor.position.y=-.29;scene.add(floor);

const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
const coinBursts=[];let simulation;
const v3=new THREE.Vector3();
let map,characterTemplate,clips,blueCanopy,redCanopy,bluePricePosition,redPricePosition,counterLayouts;
let elapsed=0,last=0,canopyReveal=0,goalClock=0,goalSales=0;
let phase='loading',level=0,cash=0,shownCash=0,price=30,speedLevel=0,workerLevel=0,sales=0;
let selectedPrice=30,upgradesUsed=0,lastInput=0,noticeTimer=0,audioContext=null,audioEnabled=true;
const prices=[60,231,870,3270,12300,46500];
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=THREE.MathUtils.clamp;
const routePoint=(x,z)=>new THREE.Vector3(x,.02,z);
const active=()=>phase==='running';

function resize(){const width=innerWidth,height=innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;const portrait=width<height;camera.fov=portrait?65:60;camera.position.set(0,portrait?15.8:11.39985,portrait?11.3:7.71526);camera.lookAt(0,0,portrait?-3.5:-3.7);camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
document.addEventListener('visibilitychange',()=>{last=0;});

const blueLabel=document.createElement('span'),redLabel=document.createElement('span');
blueLabel.className=redLabel.className='world-price';
$('world-labels').append(blueLabel,redLabel);

function positionElement(element,position,offsetY=0){v3.copy(position);v3.y+=offsetY;v3.project(camera);if(v3.z<1){element.style.left=(v3.x*.5+.5)*innerWidth+'px';element.style.top=(-v3.y*.5+.5)*innerHeight+'px';element.style.visibility='visible';}else element.style.visibility='hidden';}
function playTone(type){if(!audioEnabled)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const now=audioContext.currentTime;const notes=type==='upgrade'?[523.25,659.25,783.99]:type==='win'?[523,659,784,1046]:[880,1175];for(let i=0;i<notes.length;i++){const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=notes[i];gain.gain.setValueAtTime(0,now+i*.065);gain.gain.linearRampToValueAtTime(.035,now+i*.065+.012);gain.gain.exponentialRampToValueAtTime(.001,now+i*.065+.15);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(now+i*.065);oscillator.stop(now+i*.065+.17);}}catch{}}
function notify(text){clearTimeout(noticeTimer);$('notice').textContent=text;$('notice').classList.add('show');noticeTimer=setTimeout(()=>$('notice').classList.remove('show'),1600);}
function cashFloat(position,value){const el=document.createElement('span');el.className='float-money';el.textContent='+$'+value;$('effects').append(el);positionElement(el,position,1.8);setTimeout(()=>el.remove(),1000);}
function reaction(actor,text,duration=1.5){if(actor.bubble)actor.bubble.remove();const el=document.createElement('span');el.className='reaction';el.textContent=text;$('effects').append(el);actor.bubble=el;actor.bubbleUntil=elapsed+duration;}
function confetti(position,count=18){v3.copy(position).project(camera);const x=(v3.x*.5+.5)*innerWidth,y=(-v3.y*.5+.5)*innerHeight;for(let i=0;i<count;i++){const el=document.createElement('i');el.className='spark';el.style.left=x+'px';el.style.top=y+'px';el.style.setProperty('--color',['#ffd741','#fff3b1','#6cce35','#85edff'][i%4]);el.style.setProperty('--dx',rnd(-100,100)+'px');el.style.setProperty('--dy',rnd(-130,-25)+'px');el.style.setProperty('--rot',rnd(-320,320)+'deg');$('effects').append(el);setTimeout(()=>el.remove(),950);}}

function prepareMap(){map.traverse(n=>{if(n.isMesh){n.receiveShadow=true;n.castShadow=!/ITP_enviroment|coin|bill|hotdog_\d|products|table_cash/.test(n.name);}if(/bill_|coin_|hotdogcoin/.test(n.name))n.visible=false;});
 counterLayouts=createCounterLayouts(map);
 map.getObjectByName('ice_cream_map').visible=false;
 map.getObjectByName('hotdog_map').visible=true;
 blueCanopy=map.getObjectByName('ITP_hotdog_post_blue');redCanopy=map.getObjectByName('ITP_hotdog_post_red');
 bluePricePosition=new THREE.Vector3();redPricePosition=new THREE.Vector3();
 map.updateMatrixWorld(true);map.getObjectByName('selling_price_locator').getWorldPosition(bluePricePosition);map.getObjectByName('selling_price_locator_opponent').getWorldPosition(redPricePosition);
 scene.add(map);canopyReveal=0;blueCanopy.userData.fullScale=blueCanopy.scale.clone();blueCanopy.visible=false;
}

function initializeSimulation(){
 simulation=createParkSimulation({scene,characterTemplate,clips,counterLayouts,
  getState:()=>({phase,level,speedLevel,workerLevel,sales,price}),onReaction:reaction,
  onPaid:actor=>{if(!actor.active||!actor.hasFood||!actor.body?.visible||actor.root.parent!==scene)return;sales++;cash+=price;playTone('cash');cashFloat(actor.root.position,price);spawnBills(actor.root.position);}
 });
 simulation.reset();
}

function spawnBills(position){const material=new THREE.MeshBasicMaterial({color:0x58b95f,side:THREE.DoubleSide});for(let i=0;i<7;i++){const bill=new THREE.Mesh(new THREE.PlaneGeometry(.17,.08),material);bill.position.copy(position);bill.position.y=1.15;bill.rotation.set(rnd(-1,1),rnd(-1,1),rnd(-1,1));scene.add(bill);coinBursts.push({mesh:bill,age:0,v:new THREE.Vector3(rnd(-.7,.7),rnd(1,2),rnd(-.5,.5))});}}
function updateBills(dt){for(let i=coinBursts.length-1;i>=0;i--){const p=coinBursts[i];p.age+=dt;p.v.y-=dt*3;p.mesh.position.addScaledVector(p.v,dt);p.mesh.rotation.x+=dt*3;p.mesh.rotation.z+=dt*2;if(p.age>1.1){scene.remove(p.mesh);p.mesh.geometry.dispose();if(i===0||coinBursts[i-1]?.mesh.material!==p.mesh.material)p.mesh.material.dispose();coinBursts.splice(i,1);}}}

function syncUI(){shownCash=THREE.MathUtils.lerp(shownCash,cash,1-Math.exp(-.18));if(Math.abs(shownCash-cash)<1)shownCash=cash;$('cash').textContent=(phase==='pricing'&&cash===0?'':'$')+Math.round(shownCash).toLocaleString('en-US');blueLabel.textContent='$'+price;redLabel.textContent=level===0?'$50':'$40';const sCost=prices[Math.min(speedLevel,prices.length-1)],wCost=prices[Math.min(workerLevel,prices.length-1)];$('speed-cost').textContent=speedLevel>=4?'MAX':'$'+sCost.toLocaleString('en-US');$('worker-cost').textContent=workerLevel>=4?'MAX':'$'+wCost.toLocaleString('en-US');$('speed').classList.toggle('unaffordable',cash<sCost&&speedLevel<4);$('worker').classList.toggle('unaffordable',cash<wCost&&workerLevel<4);$('speed').classList.toggle('maxed',speedLevel>=4);$('worker').classList.toggle('maxed',workerLevel>=4);}
function upgrade(kind){
 if(!active())return;lastInput=elapsed;
 const current=kind==='speed'?speedLevel:workerLevel;
 if(current>=4){notify('MAX LEVEL!');return;}
 const cost=prices[current];if(cash<cost){notify('KEEP SERVING TO EARN MORE!');return;}
 cash-=cost;upgradesUsed++;
 if(kind==='speed')speedLevel++;else{workerLevel++;simulation.hire();}
 const button=$(kind);button.classList.remove('bump');void button.offsetWidth;button.classList.add('bump');
 $('upgrade-hand').classList.add('hidden');confetti(routePoint(0,1),28);playTone('upgrade');syncUI();
 // Give the expanded team a complete operating stretch. Upgrading used to
 // freeze the shop on the result screen only 2.5 seconds later.
 if(speedLevel>=2&&workerLevel>=2){goalSales=sales+12;goalClock=0;}
}
$('speed').addEventListener('click',()=>upgrade('speed'));
$('worker').addEventListener('click',()=>upgrade('worker'));

function slider(){selectedPrice=Number($('price').value);$('price-value').textContent=selectedPrice+'$';const fraction=(selectedPrice-5)/55;$('price').style.setProperty('--fill',fraction*100+'%');$('slider-hand').style.left=clamp(fraction*90-2,0,88)+'%';lastInput=elapsed;}
$('price').addEventListener('input',()=>{slider();$('slider-hand').classList.add('hidden');});slider();
$('start').addEventListener('click',()=>{if(phase!=='pricing')return;phase='running';lastInput=elapsed;price=selectedPrice;$('pricing').classList.add('hidden');$('upgrades').classList.remove('hidden');blueCanopy.visible=true;canopyReveal=.001;simulation.start();playTone('upgrade');});
function showResult(win=true){phase='result';$('upgrades').classList.add('hidden');$('result-badge').src='assets/'+(win?'win':'fail')+'.png';$('result').classList.remove('hidden');$('next').textContent=level===0?'NEXT BUSINESS':'PLAY NOW';playTone(win?'win':'upgrade');confetti(routePoint(0,-4),75);}
$('next').addEventListener('click',()=>{if(level===0){level=1;resetRound(false);}else resetRound(true);});
$('again').addEventListener('click',()=>resetRound(true));
function resetRound(full=true){
 if(!map)return;
 for(const p of coinBursts){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}
 coinBursts.length=0;$('effects').replaceChildren();if(full)level=0;
 cash=shownCash=speedLevel=workerLevel=sales=upgradesUsed=goalClock=goalSales=0;price=selectedPrice=level===0?30:20;
 $('price').value=selectedPrice;$('product-name').textContent=level===0?'Hot Dog':'Ice Cream';$('product-icon').src='assets/'+(level===0?'hotdog':'icecream')+'.png';
 map.getObjectByName('hotdog_map').visible=level===0;map.getObjectByName('ice_cream_map').visible=level===1;
 blueCanopy=map.getObjectByName(level===0?'ITP_hotdog_post_blue':'ITP_icrecream_post_blue');
 redCanopy=map.getObjectByName(level===0?'ITP_hotdog_post_red':'ITP_icrecream_post_red');
 map.getObjectByName('selling_price_locator').getWorldPosition(bluePricePosition);
 blueCanopy.userData.fullScale??=blueCanopy.scale.clone();
 blueCanopy.scale.copy(blueCanopy.userData.fullScale);blueCanopy.visible=false;canopyReveal=0;
 simulation.reset();phase='pricing';$('pricing').classList.remove('hidden');$('result').classList.add('hidden');$('upgrades').classList.add('hidden');$('slider-hand').classList.remove('hidden');$('upgrade-hand').classList.remove('hidden');slider();syncUI();
}
addEventListener('keydown',event=>{if(event.key.toLowerCase()==='r')resetRound(true);if(event.key.toLowerCase()==='m')audioEnabled=!audioEnabled;});

function frame(now){
 requestAnimationFrame(frame);if(!last)last=now;const dt=Math.min((now-last)/1000,.045);last=now;elapsed+=dt;
 if(phase==='loading')return;
 simulation?.update(dt);
 for(const actor of simulation?.actors||[]){
  if(actor.bubble){if(elapsed>actor.bubbleUntil){actor.bubble.remove();actor.bubble=null;}else positionElement(actor.bubble,actor.root.position,2.2);}
 }
 if(active()){
  if(canopyReveal>0&&canopyReveal<1){canopyReveal=Math.min(1,canopyReveal+dt*1.8);const k=1-Math.pow(1-canopyReveal,3);blueCanopy.scale.copy(blueCanopy.userData.fullScale);blueCanopy.scale.y*=Math.max(.001,k);}
  if(goalSales>0&&sales>=goalSales&&goalClock===0)goalClock=3;
  if(goalClock>0){goalClock-=dt;if(goalClock<=0)showResult(true);}
  if(elapsed-lastInput>4&&speedLevel===0&&cash>=60)$('upgrade-hand').classList.remove('hidden');
 }
 updateBills(dt);syncUI();
 positionElement(blueLabel,bluePricePosition);positionElement(redLabel,redPricePosition);blueLabel.style.opacity=canopyReveal===0?'0':'1';
 const labelSize=clamp(innerHeight*.022,12,24);blueLabel.style.fontSize=redLabel.style.fontSize=labelSize+'px';
 renderer.render(scene,camera);
}

async function init(){try{
 $('load-bar').style.width='15%';
 const [world,characters,environment]=await Promise.all([loader.loadAsync('assets/background.gltf'),loader.loadAsync('assets/world.gltf'),new HDRLoader().loadAsync('assets/environment.hdr')]);
 environment.mapping=THREE.EquirectangularReflectionMapping;scene.environment=environment;
 $('load-bar').style.width='70%';map=world.scene;characterTemplate=characters.scene;clips=characters.animations;
 prepareMap();initializeSimulation();phase='pricing';$('load-bar').style.width='100%';syncUI();renderer.compile(scene,camera);
 await document.fonts.ready;$('loading').style.opacity='0';setTimeout(()=>$('loading').classList.add('hidden'),420);
}catch(error){console.error(error);$('load-label').textContent='Loading failed — refresh to try again';$('load-bar').style.background='#ec735e';}}
requestAnimationFrame(frame);init();
