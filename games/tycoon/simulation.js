import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {advanceCrowd,spawnIsClear} from './crowd.js?v=staff-lanes-11';

const BODIES=[
 ['CH_male_01','CH_hair_01_male'],['CH_female_01.001','CH_skirt_01_female','CH_hair_01_female'],
 ['CH_client_house_02_01','CH_stonecutter_cap'],['CH_client_house_03_01','CH_hair_01_male'],
 ['CH_client_house_04_01','CH_client_house_04_01_beret'],['CH_gardener','CH_gardener_hat'],
 ['CH_client_house_01','CH_hair_01_male'],['CH_client_vip_01','CH_woodcutter_cap']
];
const COUNTERS=[
 {minX:-1.36,maxX:1.18,minZ:.30,maxZ:1.23},
 {minX:-1.34,maxX:1.19,minZ:-8.64,maxZ:-7.70},
 {minX:-1.38,maxX:1.15,minZ:3.94,maxZ:4.68},
 {minX:-1.13,maxX:1.40,minZ:-12.08,maxZ:-11.31}
];
const STREET={1:-3.35,'-1':-4.30};
const BLUE_LINE={x:3.3,frontZ:-.11,spacing:1.15,capacity:3};
const point=(x,z)=>new THREE.Vector3(x,.02,z);
const random=(a,b)=>a+Math.random()*(b-a);
const clamp=THREE.MathUtils.clamp;
const finiteVector=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);

export function createParkSimulation({scene,characterTemplate,clips,counterLayouts,getState,onReaction,onPaid}){
 const actors=new Set(),customers=[],workers=[],orders=new Set(),foodProps=new Set();
 const stockDocks={blue:[null,null],red:[null,null]};
 const laneSpawnTime={1:-100,'-1':-100};
 let clock=0,operatingTime=0,traffic=0,arrivalClock=1.6,nextId=1,nextTicket=1,assignmentSequence=0;
 const animations=[...clips];
 const idleClip=clips.find(c=>c.name==='idle');
 // Stop the feet while keeping the carrying arm pose. Switching to a plain
 // idle animation was what lowered the tray together with the hand.
 for(const [name,sourceName]of [['carry_idle_hotdog','hotdog_walk'],['carry_idle_icecream','walk_icecream']]){
  const source=clips.find(c=>c.name===sourceName);
  if(!source||!idleClip)continue;
  const arm=/Character_[LR]Arm/;
  const tracks=idleClip.tracks.filter(t=>!arm.test(t.name)).map(t=>t.clone());
  for(const track of source.tracks.filter(t=>arm.test(t.name))){
   const value=track.createInterpolant().evaluate(Math.min(.3,source.duration*.25));
   const frozen=track.clone();frozen.times=new Float32Array([0,idleClip.duration]);
   frozen.values=new Float32Array([...value,...value]);tracks.push(frozen);
  }
  animations.push(new THREE.AnimationClip(name,idleClip.duration,tracks));
 }

 const state=()=>getState();
 const sideOf=worker=>worker.kind==='red'?'red':'blue';
 const skillOf=worker=>worker.kind==='red'?1:1+state().speedLevel*.22;
 const pickupZ=side=>side==='blue'?BLUE_LINE.frontZ:-7.24;
 const frontZ=side=>side==='blue'?BLUE_LINE.frontZ:-6.30;
 const columnX=column=>(column-1)*1.08;
 const foodName=()=>state().level===0?'hotdog_tray':'icecream_1';

 function animation(actor,name,fade=.18){
  if(actor.animation===name)return;
  const clip=animations.find(c=>c.name===name)||idleClip;if(!clip)return;
  const action=actor.mixer.clipAction(clip);action.reset();action.paused=false;
  action.timeScale=1;action.setLoop(THREE.LoopRepeat,Infinity);action.clampWhenFinished=false;
  action.play();if(actor.action)actor.action.crossFadeTo(action,fade,false);
  actor.action=action;actor.animation=name;
 }
 function foodInHand(actor,visible){
  actor.model.traverse(n=>{if(n.name==='hotdog_tray')n.visible=visible&&state().level===0;if(n.name==='icecream_1')n.visible=visible&&state().level===1;if(n.name==='tray_empty')n.visible=false;});
 }
 function makeActor(kind='visitor',variant=Math.floor(Math.random()*BODIES.length)){
  const model=cloneSkeleton(characterTemplate),root=new THREE.Group();
  let visible=kind==='blue'?['CH_worker_01','CH_worker_cap']:kind==='red'?['CH_worker_02_oppponent','CH_worker_cap_opponent']:BODIES[variant%BODIES.length];
  // Some exported names are empty placeholders. Select an actual body mesh,
  // not merely an object with a matching name, before measuring or spawning.
  if(!model.getObjectByName(visible[0])?.isMesh)visible=['CH_male_01','CH_hair_01_male'];
  let chosen;
  model.traverse(n=>{if(n.name.startsWith('CH_'))n.visible=visible.includes(n.name);if(n.name===visible[0])chosen=n;if(n.isMesh){n.castShadow=true;n.receiveShadow=false;n.frustumCulled=false;}if(['hotdog_tray','tray_empty','icecream_1'].includes(n.name))n.visible=false;});
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(chosen||model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(!chosen?.isMesh||box.isEmpty()||!finiteVector(size)||!finiteVector(center)||size.y<=.001)throw new Error('Character body has no renderable bounds: '+visible[0]);
  const scale=1.72/Math.max(size.y,.001);model.scale.multiplyScalar(scale);
  model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);root.add(model);scene.add(root);
  const actor={id:nextId++,root,model,body:chosen,kind,mixer:new THREE.AnimationMixer(model),animation:null,action:null,
   radius:.38,velocity:{x:0,z:0},actualSpeed:0,route:[],routeIndex:0,wantsMove:false,speed:2.05,
   active:true,job:'idle',timer:0,hasFood:false,holdPose:false,order:null,inQueue:false,queueColumn:null,
   bubble:null,bubbleUntil:0};
  actors.add(actor);animation(actor,'idle');return actor;
 }
 function route(actor,points,speed=2.05){actor.route=points.map(p=>point(p[0],p[1]));actor.routeIndex=0;actor.speed=speed;}
 function follow(actor){
  let target=actor.route[actor.routeIndex];
  while(target&&actor.root.position.distanceTo(target)<.065){actor.routeIndex++;target=actor.route[actor.routeIndex];}
  actor.wantsMove=!!target;return !target;
 }
 function faceCounter(actor){actor.root.rotation.y=actor.side==='red'?Math.PI:0;}
 function turnToward(actor,angle,dt){const delta=Math.atan2(Math.sin(angle-actor.root.rotation.y),Math.cos(angle-actor.root.rotation.y));actor.root.rotation.y+=delta*(1-Math.exp(-dt*14));}
 function removeActor(actor){
  actor.bubble?.remove();actor.active=false;actors.delete(actor);scene.remove(actor.root);actor.mixer.stopAllAction();
  for(const side of ['blue','red'])for(let i=0;i<2;i++)if(stockDocks[side][i]===actor)stockDocks[side][i]=null;
 }
 function liveCustomer(customer){
  if(!customer?.active||!actors.has(customer)||!customers.includes(customer)||!customer.root.parent||
   !customer.body?.isMesh||!finiteVector(customer.root.position)||!finiteVector(customer.model.position)||!finiteVector(customer.model.scale))return false;
  for(let node=customer.body;node;node=node.parent)if(!node.visible)return false;
  return true;
 }
 function validOrderCustomer(order){
  const customer=order.customer;
  if(!liveCustomer(customer)||customer.order!==order||customer.side!==order.side||!customer.willBuy||customer.hasFood)return false;
  // An order may wait for a clear counter while its guest remains in the FIFO
  // line. Its clerk does not collect food until that guest has been called.
  return order.called?['service_approach','ordering','receiving'].includes(customer.job):
   customer.inQueue&&['approach','queue','waiting'].includes(customer.job);
 }
 function atHandoff(order){
  if(!order.called)return false;
  const customer=order.customer;
  return liveCustomer(customer)&&Math.abs(customer.root.position.x-order.pickupX)<.14&&
   Math.abs(customer.root.position.z-pickupZ(order.side))<.14&&customer.actualSpeed<.12;
 }
 function cancelOrder(order){
  if(!orders.delete(order))return;
  order.status='cancelled';removeFood(order.prop);order.prop=null;
  if(order.worker?.order===order)returnHome(order.worker);
  const customer=order.customer;
  if(customer?.order!==order)return;
  customer.order=null;customer.holdPose=false;customer.hasFood=false;foodInHand(customer,false);
  if(!liveCustomer(customer)){
   if(customer.active)removeActor(customer);
   const index=customers.indexOf(customer);if(index>=0)customers.splice(index,1);
  }else if(['service_approach','ordering','receiving'].includes(customer.job))startExit(customer);
 }
 function residents(side,column){return customers.filter(c=>c.active&&c.inQueue&&c.side===side&&c.queueColumn===column).sort((a,b)=>a.ticket-b.ticket);}
 function blueLine(){return customers.filter(c=>c.active&&c.inQueue&&c.side==='blue').sort((a,b)=>a.ticket-b.ticket);}
 function slot(actor){
  if(actor.side==='blue'){
   const rank=Math.max(0,blueLine().indexOf(actor));
   // One FIFO line beside the right post. Its position depends only on queue
   // rank, never on orders, plate reservations or another guest's job.
   return [BLUE_LINE.x,BLUE_LINE.frontZ-rank*BLUE_LINE.spacing];
  }
  const rank=Math.max(0,residents(actor.side,actor.queueColumn).indexOf(actor));
  return [columnX(actor.queueColumn),frontZ(actor.side)+rank*1.2];
 }
 function advanceQueue(customer,destination){
  customer.job='queue';route(customer,[destination]);
 }
 function chooseColumn(side){
  if(side==='blue')return blueLine().length<BLUE_LINE.capacity?0:null;
  let best=0,min=Infinity;for(let column=0;column<3;column++){const count=residents(side,column).length;if(count<min){best=column;min=count;}}return min<2?best:null;
 }
 function makeCustomer(side,direction,position,column){
  const actor=makeActor();actor.side=side;actor.direction=direction;actor.lane=STREET[direction];
  actor.root.position.copy(position);actor.root.rotation.y=direction*Math.PI/2;actor.ticket=nextTicket++;
  actor.queueColumn=column;actor.inQueue=column!==null;actor.willBuy=side==='red'||state().price<=45||Math.random()<clamp(1-(state().price-45)/21,.06,.95);
  customers.push(actor);
  if(column===null){actor.job='passing';route(actor,[[direction*25,actor.lane]]);}
  else{actor.job='approach';const p=slot(actor);route(actor,[[p[0],actor.lane],p]);}
  return actor;
 }
 function spawnVisitor(){
  if(customers.length>=Math.round(22+traffic*20))return false;
  const first=laneSpawnTime[1]<=laneSpawnTime[-1]?1:-1;
  for(const direction of [first,-first]){
   const origin=point(-direction*20,STREET[direction]);
   if(clock-laneSpawnTime[direction]<.95||!spawnIsClear(origin,actors,.38,1.05))continue;
   let side=direction===1?(Math.random()<clamp(.78+traffic*.16-(state().price-30)/80,.18,.96)?'blue':'passer'):
    (Math.random()<.65?'red':'passer');
   const column=side==='red'?chooseColumn(side):null;
   if(side==='red'&&column===null)side='passer';
   const customer=makeCustomer(side,direction,origin,column);
   if(side==='blue'){
    // Walk-ins do not reserve a queue slot from the far end of the street.
    // Admission is decided at the entrance, so the line can refill naturally.
    customer.job='arriving';route(customer,[[BLUE_LINE.x,customer.lane]]);
   }
   laneSpawnTime[direction]=clock;return true;
  }
  return false;
 }
 function makeWorker(kind,index){
  const actor=makeActor(kind);actor.slot=index;actor.side=kind;actor.job='idle';actor.lastAssigned=0;
  const homes=kind==='red'?[[0,state().level===0?-9.95:-9.9]]:[[-1.7,2.6],[1.7,2.6],[-2.8,2.6],[2.8,2.6],[-3.9,2.6]];
  actor.home=homes[Math.min(index,homes.length-1)];
  const others=[...actors].filter(a=>a!==actor);
  const candidates=[actor.home,[actor.home[0]-.95,actor.home[1]],[actor.home[0]+.95,actor.home[1]],[-4-index*1.1,actor.home[1]]];
  const origin=candidates.find(p=>(kind==='red'||Math.abs(p[0])>=1.65)&&
   workers.every(w=>Math.hypot(p[0]-w.home[0],p[1]-w.home[1])>=.95)&&
   spawnIsClear(point(...p),others,.38,.12))||candidates[candidates.length-1];
  // The free spawn position is also this clerk's standby position. Do not
  // send a new hire straight back into a nominal bay occupied by a colleague.
  actor.home=[...origin];
  actor.root.position.copy(point(...origin));
  actor.root.rotation.y=kind==='red'?0:Math.PI;workers.push(actor);return actor;
 }
 function meshesForFood(actor){
  actor.model.updateMatrixWorld(true);const source=actor.model.getObjectByName(foodName());const meshes=[];
  source?.traverse(n=>{if(n.isMesh){n.skeleton?.update();meshes.push(n);}});return meshes;
 }
 function foodCenter(actor){
  const bounds=new THREE.Box3(),vertex=new THREE.Vector3();
  for(const mesh of meshesForFood(actor)){const count=mesh.geometry.attributes.position.count;for(let i=0;i<count;i++){mesh.getVertexPosition(i,vertex);vertex.applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(vertex);}}
  return bounds.isEmpty()?actor.root.position.clone().add(new THREE.Vector3(0,1.05,actor.side==='red'?-.4:.4)):bounds.getCenter(new THREE.Vector3());
 }
 function bakeFood(actor){
  const group=new THREE.Group(),bounds=new THREE.Box3(),vertex=new THREE.Vector3();
  for(const mesh of meshesForFood(actor)){
   const geometry=mesh.geometry.clone(),count=geometry.attributes.position.count,positions=new Float32Array(count*3);
   for(let i=0;i<count;i++){mesh.getVertexPosition(i,vertex);vertex.applyMatrix4(mesh.matrixWorld);vertex.toArray(positions,i*3);bounds.expandByPoint(vertex);}
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   geometry.deleteAttribute('normal');geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.morphAttributes={};
   geometry.computeVertexNormals();geometry.boundingBox=null;geometry.boundingSphere=null;
   const copy=new THREE.Mesh(geometry,mesh.material);copy.castShadow=true;copy.frustumCulled=false;group.add(copy);
  }
  if(bounds.isEmpty()||!finiteVector(bounds.min)||!finiteVector(bounds.max)){
   for(const mesh of group.children)mesh.geometry.dispose();return null;
  }
  const center=bounds.getCenter(new THREE.Vector3());
  for(const mesh of group.children){mesh.geometry.translate(-center.x,-center.y,-center.z);mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();}
  group.position.copy(center);group.userData.bottom=center.y-bounds.min.y;
  scene.add(group);foodProps.add(group);return group;
 }
 function removeFood(prop){if(!prop)return;scene.remove(prop);prop.traverse(n=>{if(n.isMesh)n.geometry.dispose();});foodProps.delete(prop);}
 function counterPoint(order){return new THREE.Vector3(order.reservation.x,counterLayouts[order.side].surfaceY+.014+(order.prop?.userData.bottom||.045),order.reservation.z);}
 function findCounterSpace(side,halfX=.35,halfZ=.31,ignore=null,customer=ignore?.customer){
  const table=counterLayouts[side],gap=.055;
  const minX=table.minX+halfX+gap,maxX=table.maxX-halfX-gap;
  const minZ=table.minZ+halfZ+gap,maxZ=table.maxZ-halfZ-gap;
  if(minX>maxX||minZ>maxZ)return null;
  const occupied=[...table.obstacles];
  for(const order of orders)if(order!==ignore&&order.side===side&&order.reservation){
   const r=order.reservation;occupied.push({minX:r.x-r.halfX,maxX:r.x+r.halfX,minZ:r.z-r.halfZ,maxZ:r.z+r.halfZ});
  }
  const clear=(x,z)=>!occupied.some(b=>x+halfX>b.minX-gap&&x-halfX<b.maxX+gap&&z+halfZ>b.minZ-gap&&z-halfZ<b.maxZ+gap);
  const candidates=[];
  const otherPeople=side==='blue'?[...actors].filter(a=>a!==customer):[];
  const preferredX=(side==='blue'?(ignore?.pickupX??-.24):(customer?.root.position.x??(minX+maxX)/2))+random(-.065,.065);
  const preferredZ=clamp(side==='blue'?minZ+.06:maxZ-.06,minZ,maxZ)+random(-.025,.025);
  function candidate(x,z){
   if(!clear(x,z))return;
   const pickupX=ignore?.pickupX??x;
   if(ignore&&Math.abs(x-pickupX)>.1)return;
   if(side==='blue'){
    // Only the called guest enters this counter space. The waiting line and
    // departure lane never take part in allocating the serving position.
    if(x<-.48||x>.12||Math.abs(x-pickupX)>.1)return;
    if(!spawnIsClear(point(pickupX,frontZ(side)),otherPeople,customer.radius,.08))return;
   }
   candidates.push({x,z,halfX,halfZ,pickupX,score:Math.abs(x-preferredX)+Math.abs(z-preferredZ)*.15});
  }
  // Plan the serving position first; the called guest walks to its matching
  // position before the worker puts the plate down.
  for(let i=0;i<64;i++)candidate(random(minX,maxX),random(minZ,maxZ));
  for(let i=0;i<=24;i++)for(let j=0;j<=6;j++)candidate(THREE.MathUtils.lerp(minX,maxX,i/24),THREE.MathUtils.lerp(minZ,maxZ,j/6));
  candidates.sort((a,b)=>a.score-b.score);
  if(!candidates.length)return null;
  const {score,...placement}=candidates[0];return placement;
 }
 function releaseDock(worker){const docks=stockDocks[sideOf(worker)];for(let i=0;i<2;i++)if(docks[i]===worker)docks[i]=null;worker.dock=null;}
 function returnHome(worker){
  worker.order=null;worker.holdPose=false;worker.hasFood=false;foodInHand(worker,false);releaseDock(worker);
  worker.job='returning';
  // Leave the central serving lane sideways, then return to this clerk's
  // fixed bay. Standby staff stay outside both pickup and delivery routes.
  const laneZ=worker.root.position.z<2?1.7:worker.root.position.z;
  const path=worker.kind==='blue'?[[worker.root.position.x,laneZ],[worker.home[0],laneZ],worker.home]:[worker.home];
  route(worker,path,2.05*skillOf(worker));
 }
 function startExit(customer){
  if(customer.side==='blue'){
   customer.inQueue=false;customer.job='leaving';
   // Served guests go left; guests declining to buy leave around the right
   // side of the line. Neither path crosses back through waiting customers.
   const outer=customer.hasFood||customer.root.position.x<BLUE_LINE.x-.6?-2.8:4.3;
   route(customer,[[outer,customer.root.position.z],[outer,customer.lane],[customer.direction*25,customer.lane]],2.05);
   return;
  }
  const z=pickupZ(customer.side);customer.job='exit_approach';
  route(customer,[[customer.root.position.x,z]],2.05);
 }
 function leaveCounter(customer){
  customer.inQueue=false;customer.job='leaving';
  const z=pickupZ(customer.side),outer=2.7;
  route(customer,[[outer,z],[outer,customer.lane],[customer.direction*25,customer.lane]],2.05);
 }
 function assignOrder(worker){
  const side=sideOf(worker);
  const waiting=side==='blue'?[blueLine().find(c=>!c.order)].filter(c=>c?.job==='waiting'):
   customers.filter(c=>c.active&&c.side===side&&c.job==='waiting'&&residents(side,c.queueColumn)[0]===c&&
    ![...orders].some(o=>o.side===side&&o.column===c.queueColumn)&&Math.abs(c.root.position.z-frontZ(side))<.15&&Math.abs(c.root.position.x-columnX(c.queueColumn))<.15);
  for(const customer of waiting){
   if(!liveCustomer(customer))continue;
   if(!customer.willBuy){
    if(side==='blue'&&blueLine()[0]!==customer)return null;
    customer.job='refuse';customer.timer=.85;onReaction(customer,'😠',1.25);continue;
   }
   const order={worker,customer,side,column:customer.queueColumn,called:false,reservation:null,pickupX:null,trayAngle:random(-.055,.055),status:'reserved',prop:null,clock:0,presentFor:0,absentFor:0,paid:false};
   orders.add(order);customer.order=worker.order=order;customer.timer=0;
   worker.lastAssigned=++assignmentSequence;worker.job='await_stock';
   return order;
  }
  return null;
 }
 function callNextOrder(side){
  if([...orders].some(o=>o.side===side&&o.called)||customers.some(c=>c.active&&c.side===side&&
   ['service_approach','ordering','receiving','served'].includes(c.job)))return;
  const order=[...orders].filter(o=>o.side===side&&!o.called).sort((a,b)=>a.customer.ticket-b.customer.ticket)[0];
  if(!order||!validOrderCustomer(order))return;
  const customer=order.customer;
  if(side==='blue'&&(blueLine()[0]!==customer||customer.job!=='waiting'||
   Math.abs(customer.root.position.x-BLUE_LINE.x)>.13||Math.abs(customer.root.position.z-BLUE_LINE.frontZ)>.13))return;
  const reservation=findCounterSpace(side,.35,.31,null,customer);if(!reservation)return;
  order.reservation=reservation;order.pickupX=reservation.pickupX;order.called=true;
  customer.job='service_approach';
  if(side==='blue'){
   customer.inQueue=false;route(customer,[[order.pickupX,frontZ(side)]],1.65);
  }else route(customer,[[columnX(customer.queueColumn),pickupZ(side)],[order.pickupX,pickupZ(side)]],1.8);
 }
 function dispatchOrders(){
  for(const side of ['blue','red']){
   const team=workers.filter(w=>w.active&&sideOf(w)===side);
   // Rotate a single active service job. Do not prepare another tray while
   // the preceding guest is collecting food or still standing at the counter.
   const occupied=[...orders].some(o=>o.side===side)||customers.some(c=>c.active&&c.side===side&&
    ['service_approach','ordering','receiving','served'].includes(c.job));
   if(!occupied){
    const available=team.filter(w=>w.job==='idle'&&!w.order).sort((a,b)=>a.lastAssigned-b.lastAssigned||a.id-b.id);
    if(available.length)assignOrder(available[0]);
   }
   callNextOrder(side);
  }
 }
 function startDelivery(worker){
  worker.order.status='carrying';worker.job='delivering';
  route(worker,[[worker.order.reservation.x,worker.kind==='red'?-9.05:1.85]],2.05*skillOf(worker));
 }
 function tryFetch(worker){
  const docks=stockDocks[sideOf(worker)];let dock=docks.findIndex(d=>d===null);
  if(dock<0)return false;
  const preferred=worker.root.position.x>0?1:0;if(docks[preferred]===null)dock=preferred;
  docks[dock]=worker;worker.dock=dock;worker.job='fetching';
  const stockZ=worker.kind==='red'?(state().level===0?-10.9:-9.95):3.45;
  const path=worker.kind==='blue'?[[worker.home[0],stockZ],[dock===0?-.62:.62,stockZ]]:[[dock===0?-.62:.62,stockZ]];
  route(worker,path,2.05*skillOf(worker));return true;
 }
 function updateWorker(worker,dt){
  if(worker.order&&!validOrderCustomer(worker.order)){cancelOrder(worker.order);return;}
  worker.timer-=dt;
  if(worker.job==='idle'){
   turnToward(worker,worker.kind==='red'?0:Math.PI,dt);
  }else if(worker.job==='await_stock'){
   if(worker.order.called)tryFetch(worker);
  }else if(worker.job==='fetching'&&follow(worker)){
   worker.job='preparing';worker.timer=.42/skillOf(worker);
  }else if(worker.job==='preparing'){
   turnToward(worker,worker.kind==='red'?Math.PI:0,dt);
   if(worker.timer<=0){
    worker.hasFood=true;foodInHand(worker,true);releaseDock(worker);
    startDelivery(worker);
   }
  }else if(worker.job==='delivering'&&follow(worker)){
   worker.job='aligning';worker.timer=.24;worker.holdPose=true;
  }else if(worker.job==='aligning'){
   turnToward(worker,worker.kind==='red'?0:Math.PI,dt);
   if(worker.timer<=0&&worker.order.customer.job==='ordering'&&atHandoff(worker.order)&&worker.order.presentFor>=.15){
    worker.model.updateMatrixWorld(true);
    const order=worker.order;order.prop=bakeFood(worker);
    if(!order.prop){cancelOrder(order);return;}
    if(order.prop){
     order.prop.rotation.y=order.trayAngle;order.prop.updateMatrixWorld(true);
     const size=new THREE.Box3().setFromObject(order.prop).getSize(new THREE.Vector3());
     order.halfX=size.x/2+.012;order.halfZ=size.z/2+.012;
     // Recheck the actual carried model as well as the provisional footprint.
     // An oversized serving waits in the worker's hands instead of clipping.
     if(order.halfX>order.reservation.halfX||order.halfZ>order.reservation.halfZ){
      const reservation=findCounterSpace(order.side,order.halfX,order.halfZ,order);
      if(!reservation){order.reservation=null;order.prop.visible=false;order.status='waiting_space';worker.job='waiting_space';worker.timer=.2;return;}
      order.reservation=reservation;
     }
    }
    order.start=order.prop?.position.clone()||foodCenter(worker);order.end=counterPoint(order);
    order.status='placing';order.clock=0;worker.job='placing';worker.holdPose=true;
    // The serving is now an independent world object, so lowering the hand
    // cannot pull the plate back off the counter.
    worker.hasFood=false;foodInHand(worker,false);
   }
  }else if(worker.job==='waiting_space'&&worker.timer<=0){
   const order=worker.order;worker.timer=.2;
   const reservation=findCounterSpace(order.side,order.halfX,order.halfZ,order);
   if(reservation){
    order.reservation=reservation;order.status='carrying';removeFood(order.prop);order.prop=null;
    worker.job='delivering';route(worker,[[reservation.x,worker.side==='blue'?1.85:-9.05]],2.05*skillOf(worker));
   }
  }else if(worker.job==='returning'&&follow(worker)){
   worker.job='idle';
  }
 }
 function updateCustomer(customer,dt){
  if(customer.job==='arriving'&&customer.root.position.x>=BLUE_LINE.x-1.4){
   const column=chooseColumn('blue');
   if(column===null){customer.job='passing';route(customer,[[customer.direction*25,customer.lane]]);}
   else{
    customer.queueColumn=column;customer.inQueue=true;customer.job='approach';
    route(customer,[[BLUE_LINE.x,customer.lane],slot(customer)]);
   }
  }
  if(customer.inQueue&&['approach','queue','waiting'].includes(customer.job)){
   const destination=slot(customer),last=customer.route[customer.route.length-1];
   if(customer.job==='waiting'&&(Math.abs(customer.root.position.z-destination[1])>.12||Math.abs(customer.root.position.x-destination[0])>.12)){
    advanceQueue(customer,destination);
   }else if(last&&customer.job!=='waiting'){last.x=destination[0];last.z=destination[1];}
  }
  if(['approach','queue'].includes(customer.job)&&follow(customer)){
   customer.job='waiting';customer.timer=0;faceCounter(customer);
  }else if(customer.job==='waiting'){
   if(!customer.order)customer.timer+=dt;
   faceCounter(customer);if(customer.timer>28){customer.job='refuse';customer.timer=.7;onReaction(customer,'😠',1.1);}
  }else if(customer.job==='service_approach'&&follow(customer)){
   if(customer.side==='red')customer.inQueue=false;
   customer.job='ordering';faceCounter(customer);
  }else if(customer.job==='ordering')faceCounter(customer);
  else if(customer.job==='served'){
   if(customer.side==='blue')turnToward(customer,-Math.PI/2,dt);
   customer.timer-=dt;if(customer.timer<=0)startExit(customer);
  }else if(customer.job==='refuse'){
   customer.timer-=dt;if(customer.timer<=0)startExit(customer);
  }else if(customer.job==='exit_approach'&&follow(customer))leaveCounter(customer);
  else if(['arriving','passing','leaving'].includes(customer.job)&&follow(customer)){
   removeActor(customer);const i=customers.indexOf(customer);if(i>=0)customers.splice(i,1);
  }
 }
 function updateOrders(dt){
  for(const order of [...orders]){
   if(!validOrderCustomer(order)){cancelOrder(order);continue;}
   const present=atHandoff(order)&&['ordering','receiving'].includes(order.customer.job);
   order.presentFor=present?order.presentFor+dt:0;
   if(['placing','ready','receiving'].includes(order.status)){
    if(!order.prop?.parent||!order.prop.visible||!finiteVector(order.prop.position)){cancelOrder(order);continue;}
    if(!present){
     order.absentFor+=dt;
     if(order.absentFor>.25)cancelOrder(order);
     continue;
    }
    order.absentFor=0;
   }
   if(order.status==='placing'){
    order.clock+=dt;const t=clamp(order.clock/.42,0,1),ease=t*t*(3-2*t);
    if(order.prop){order.prop.position.lerpVectors(order.start,order.end,ease);order.prop.position.y+=Math.sin(Math.PI*t)*.09;}
    if(t>.65)order.worker.holdPose=false;
    if(t===1){
     order.prop?.position.copy(order.end);order.status='ready';returnHome(order.worker);order.worker=null;
    }
   }else if(order.status==='ready'){
    const customer=order.customer;
    // Both stalls require the actual, visible owner of this order to be
    // standing at the matching hand-off point before a transfer can start.
    if(customer.job==='ordering'&&present&&order.presentFor>=.15){
     customer.route=[];customer.routeIndex=0;customer.wantsMove=false;
     customer.job='receiving';customer.holdPose=true;faceCounter(customer);
     order.status='receiving';order.clock=0;
    }
   }else if(order.status==='receiving'){
    order.clock+=dt;
    // A short rest makes the counter hand-off readable before the guest takes it.
    const t=clamp((order.clock-.24)/.34,0,1);
    if(t>0){
     const destination=foodCenter(order.customer);
     if(!finiteVector(destination)){cancelOrder(order);continue;}
     order.prop.position.lerpVectors(order.end,destination,t*t*(3-2*t));order.prop.position.y+=Math.sin(Math.PI*t)*.06;
    }
    if(t===1){
     if(!liveCustomer(order.customer)||!atHandoff(order)||!meshesForFood(order.customer).length){cancelOrder(order);continue;}
     removeFood(order.prop);order.prop=null;const customer=order.customer;
     customer.hasFood=true;customer.holdPose=false;foodInHand(customer,true);
     customer.job='served';customer.timer=.32;customer.order=null;
     if(!order.paid){order.paid=true;if(order.side==='blue')onPaid(customer);if(Math.random()<.6)onReaction(customer,'😋',1.2);}
     order.status='complete';orders.delete(order);
    }
   }
  }
 }
 function animate(dt){
  for(const actor of actors){
   const holding=actor.hasFood||actor.holdPose;
   actor.walkHold=actor.actualSpeed>.15?.18:Math.max(0,(actor.walkHold||0)-dt);
   actor.smoothedSpeed=THREE.MathUtils.lerp(actor.smoothedSpeed||0,actor.actualSpeed,1-Math.exp(-dt*12));
   const moving=actor.wantsMove&&actor.walkHold>0;
   const name=moving?(holding?(state().level===0?'hotdog_walk':'walk_icecream'):'walk_1'):
    holding?(state().level===0?'carry_idle_hotdog':'carry_idle_icecream'):'idle';
   animation(actor,name,holding?.16:.2);
   if(actor.action)actor.action.timeScale=moving?clamp(actor.smoothedSpeed/2.05,.12,1.8):1;
   actor.mixer.update(dt);
  }
 }

 function reset(){
  for(const order of orders)removeFood(order.prop);orders.clear();
  for(const prop of [...foodProps])removeFood(prop);
  for(const actor of [...actors])removeActor(actor);
  customers.length=workers.length=0;stockDocks.blue.fill(null);stockDocks.red.fill(null);
  nextTicket=1;nextId=1;arrivalClock=1.6;clock=0;laneSpawnTime[1]=laneSpawnTime[-1]=-100;
  operatingTime=traffic=assignmentSequence=0;
  makeWorker('blue',0);makeWorker('red',0);
  for(let i=0;i<6;i++){const direction=i%2?1:-1;makeCustomer('passer',direction,point(-15+i*6,STREET[direction]),null);}
 }
 function start(){
  for(const side of ['blue','red'])for(let column=0;column<3;column++){
   const direction=side==='blue'?1:-1;
   const position=side==='blue'?point(BLUE_LINE.x,BLUE_LINE.frontZ-column*BLUE_LINE.spacing):
    point(columnX(column),frontZ(side)+.65);
   if(!spawnIsClear(position,actors,.38,.04))continue;
   const customer=makeCustomer(side,direction,position,column);customer.job='queue';route(customer,[slot(customer)]);
  }
 }
 function update(dt){
  if(state().phase!=='running'&&state().phase!=='pricing')return;
  clock+=dt;for(const actor of actors)actor.wantsMove=false;
  if(state().phase==='running'){
   operatingTime+=dt;
   const progress=clamp(operatingTime/90+(state().workerLevel||0)*.12+state().speedLevel*.06+(state().sales||0)*.008,0,1);
   traffic=THREE.MathUtils.lerp(traffic,progress,1-Math.exp(-dt*.35));
   arrivalClock-=dt;
   if(arrivalClock<=0)arrivalClock=spawnVisitor()?random(.9,1.1)*THREE.MathUtils.lerp(1.65,.68,traffic):.2;
   for(const customer of [...customers])updateCustomer(customer,dt);
   dispatchOrders();
   for(const worker of workers)updateWorker(worker,dt);
  }else for(const customer of [...customers])if(customer.job==='passing')updateCustomer(customer,dt);
  advanceCrowd(actors,dt,COUNTERS);
  animate(dt);
  if(state().phase==='running')updateOrders(dt);
 }
 return {actors,reset,start,update,hire:()=>makeWorker('blue',workers.filter(w=>w.kind==='blue').length)};
}
