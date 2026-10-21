// Route following is resolved for everybody at once. Waiting customers keep their
// space; moving people yield, retain headway, and cannot step through a body.
const EPSILON=1e-6;
const BODY_GAP=.06;
const FOLLOW_GAP=1.5;
const length=(x,z)=>Math.hypot(x,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function spawnIsClear(position,actors,radius=.38,clearance=.25){
 for(const actor of actors){if(!actor.active)continue;const p=actor.root.position;const gap=radius+(actor.radius||.38)+clearance;if(length(position.x-p.x,position.z-p.z)<gap)return false;}
 return true;
}

function projectOutOfObstacle(point,radius,obstacle){
 const minX=obstacle.minX-radius,maxX=obstacle.maxX+radius;
 const minZ=obstacle.minZ-radius,maxZ=obstacle.maxZ+radius;
 if(point.x<=minX||point.x>=maxX||point.z<=minZ||point.z>=maxZ)return;
 const distances=[point.x-minX,maxX-point.x,point.z-minZ,maxZ-point.z];
 const edge=distances.indexOf(Math.min(...distances));
 if(edge===0)point.x=minX;else if(edge===1)point.x=maxX;else if(edge===2)point.z=minZ;else point.z=maxZ;
}

function preferred(actor,dt){
 const p=actor.root.position,target=actor.route[actor.routeIndex];
 if(!actor.wantsMove||!target)return {actor,x:p.x,z:p.z,vx:0,vz:0,dx:0,dz:0,moving:false};
 const x=target.x-p.x,z=target.z-p.z,distance=length(x,z);
 if(distance<EPSILON)return {actor,x:p.x,z:p.z,vx:0,vz:0,dx:0,dz:0,moving:false};
 const speed=Math.min(actor.speed,distance/dt),dx=x/distance,dz=z/distance;
 return {actor,x:p.x,z:p.z,vx:dx*speed,vz:dz*speed,dx,dz,moving:true};
}

export function advanceCrowd(actors,dt,obstacles=[]){
 if(dt<=0)return;
 const plans=[...actors].filter(a=>a.active).map(a=>preferred(a,dt));
 function admitMoves(){
 const occupied=new Map(plans.map(p=>[p.actor,{x:p.x,z:p.z}]));
 for(const plan of plans){
  if(!plan.moving)continue;
  const radius=(plan.actor.radius||.38)+.015;
  const fits=(x,z)=>{
   for(const obstacle of obstacles)if(x>obstacle.minX-radius&&x<obstacle.maxX+radius&&z>obstacle.minZ-radius&&z<obstacle.maxZ+radius)return false;
   for(const other of plans){
    if(other===plan)continue;
    const p=occupied.get(other.actor),minimum=(plan.actor.radius||.38)+(other.actor.radius||.38)+BODY_GAP;
    if(length(x-p.x,z-p.z)<minimum-.000001)return false;
   }
   return true;
  };
  // Admission is checked against committed positions and everybody else's old
  // position. A crowd projection can never force a step through another body.
  if(!fits(plan.nx,plan.nz)){
   const dx=plan.nx-plan.x,dz=plan.nz-plan.z;let low=0,high=1;
   for(let i=0;i<20;i++){const mid=(low+high)*.5;if(fits(plan.x+dx*mid,plan.z+dz*mid))low=mid;else high=mid;}
   plan.nx=plan.x+dx*low;plan.nz=plan.z+dz*low;
  }
  occupied.set(plan.actor,{x:plan.nx,z:plan.nz});
 }
 }
 for(const plan of plans){
  if(!plan.moving)continue;
  let allowed=length(plan.vx,plan.vz),steerX=0,steerZ=0;
  for(const other of plans){
   if(other===plan)continue;
   const rx=other.x-plan.x,rz=other.z-plan.z,distance=length(rx,rz);
   if(distance>3.4||distance<EPSILON)continue;
   const along=rx*plan.dx+rz*plan.dz;
   const across=Math.abs(rx*plan.dz-rz*plan.dx);
   const body=(plan.actor.radius||.38)+(other.actor.radius||.38)+BODY_GAP;
   const heading=plan.dx*other.dx+plan.dz*other.dz;
   const sameStream=other.moving&&heading>.82&&across<body*.85;
   if(sameStream&&along>0&&along<2.9){
    const leader=Math.max(0,(other.actor.velocity?.x||0)*plan.dx+(other.actor.velocity?.z||0)*plan.dz);
    allowed=Math.min(allowed,Math.max(0,leader+(along-FOLLOW_GAP)/.55));
    continue;
   }
   // Predict crossing conflicts before bodies touch. The newer person yields.
   const rvx=plan.vx-other.vx,rvz=plan.vz-other.vz,denom=rvx*rvx+rvz*rvz;
   const time=denom>EPSILON?(rx*rvx+rz*rvz)/denom:-1;
   const predicted=time>0?length(rx-rvx*time,rz-rvz*time):distance;
   if(other.moving&&time>0&&time<.8&&predicted<body+.12&&plan.actor.id>other.actor.id){
    allowed=Math.min(allowed,Math.max(0,(distance-body-.12)/.85));
   }
   if(along>-.05&&distance<body+.6&&!sameStream&&
      (across<body+.1||(time>0&&time<.8&&predicted<body+.16))){
    // Consistent passing side prevents left/right oscillation at a blockage.
    const side=rx*plan.dz-rz*plan.dx;
    const handed=Math.abs(side)>.08?(side>0?1:-1):1;
    const strength=(1-distance/(body+.6))*.85;
    steerX+=-plan.dz*handed*strength;
    steerZ+=plan.dx*handed*strength;
    if(!other.moving&&along>0&&across<body*.8){
     allowed=Math.min(allowed,Math.max(.1,(distance-body)/.45));
    }
   }
  }
  const sx=plan.dx+steerX,sz=plan.dz+steerZ,sn=length(sx,sz)||1;
  plan.nx=plan.x+sx/sn*allowed*dt;plan.nz=plan.z+sz/sn*allowed*dt;
 }
 for(const plan of plans){plan.nx??=plan.x;plan.nz??=plan.z;}

 // Project collisions together, rather than allowing update order to favor one
 // pedestrian. A stationary queue member is an immovable occupied slot.
 for(let pass=0;pass<12;pass++){
  let corrected=false;
  for(let i=0;i<plans.length;i++){
   const a=plans[i];
   if(a.moving){const point={x:a.nx,z:a.nz};for(const box of obstacles)projectOutOfObstacle(point,(a.actor.radius||.38)+.015,box);a.nx=point.x;a.nz=point.z;}
   for(let j=i+1;j<plans.length;j++){
    const b=plans[j],dx=b.nx-a.nx,dz=b.nz-a.nz,distance=length(dx,dz);
    const minimum=(a.actor.radius||.38)+(b.actor.radius||.38)+BODY_GAP;
    if(distance>=minimum-.00001||(!a.moving&&!b.moving))continue;
    const nx=distance>EPSILON?dx/distance:1,nz=distance>EPSILON?dz/distance:0;
    const amount=minimum-distance+.00001;
    const aWeight=a.moving?(b.moving?.5:1):0,bWeight=b.moving?(a.moving?.5:1):0;
    a.nx-=nx*amount*aWeight;a.nz-=nz*amount*aWeight;
    b.nx+=nx*amount*bWeight;b.nz+=nz*amount*bWeight;corrected=true;
   }
  }
  if(!corrected)break;
 }
 admitMoves();
 for(const plan of plans){
  const actor=plan.actor,p=actor.root.position;
  actor.velocity??={x:0,z:0};
  actor.velocity.x=(plan.nx-p.x)/dt;actor.velocity.z=(plan.nz-p.z)/dt;
  p.x=plan.nx;p.z=plan.nz;
  const speed=length(actor.velocity.x,actor.velocity.z);
  actor.actualSpeed=speed;
  if(speed>.04){const angle=Math.atan2(actor.velocity.x,actor.velocity.z),delta=Math.atan2(Math.sin(angle-actor.root.rotation.y),Math.cos(angle-actor.root.rotation.y));actor.root.rotation.y+=delta*(1-Math.exp(-dt*12));}
  const target=actor.route[actor.routeIndex];
  if(plan.moving&&target&&length(target.x-p.x,target.z-p.z)<.075)actor.routeIndex++;
  actor.blockedFor=plan.moving&&speed<.08?(actor.blockedFor||0)+dt:0;
 }
}
