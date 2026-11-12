import * as T from 'three';
import { PointerLockControls } from 'pointer-lock';
import { makeWorld, makeBot, makePulser, bounds } from './world.js';
import { makeNavigation } from './navigation.js';

const $=id=>document.getElementById(id);
const touchCapable=matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints>1 && !matchMedia('(hover: hover)').matches);
document.body.classList.toggle('touch',touchCapable);
if(touchCapable)$('controls').innerHTML='<span><kbd>L</kbd> Move</span><span><kbd>DRAG</kbd> Look</span><span><kbd>R</kbd> Fire / jump</span>';

async function createRenderer(){
  const element=document.createElement('canvas');
  const options={antialias:true,alpha:false,powerPreference:'high-performance'};
  const context=element.getContext('webgl2',options)||element.getContext('webgl',options);
  if(context)return new T.WebGLRenderer({canvas:element,context,...options});
  const {CanvasRenderer}=await import('./canvas-renderer.js');
  return new CanvasRenderer();
}
const renderer=await createRenderer();
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
$('viewport').appendChild(renderer.domElement);
const canvas=renderer.domElement;
const camera=new T.PerspectiveCamera(66,1,.045,175);camera.rotation.order='YXZ';
const scene=new T.Scene();scene.add(camera);
const world=makeWorld(scene),nav=makeNavigation(bounds,world.colliders);
const controls=new PointerLockControls(camera,canvas);
controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI-.18;
const gun=makePulser(camera);
const bots=Array.from({length:10},()=>({...makeBot(scene),active:false,hp:2,clock:0,warn:0,delay:0,hit:0}));
for(const bot of bots)bot.root.visible=false;
const ray=new T.Raycaster(),tmp=new T.Vector3(),aim=new T.Vector2(),direction=new T.Vector3();
const beam=new T.Mesh(new T.CylinderGeometry(.014,.022,1,5),new T.MeshBasicMaterial({color:0xcaff70,transparent:true,depthWrite:false}));beam.visible=false;scene.add(beam);
const capacity=180,positions=new Float32Array(capacity*3),velocities=new Float32Array(capacity*3),colors=new Float32Array(capacity*3),lives=new Float32Array(capacity);
positions.fill(-999);
const debris=new T.BufferGeometry();
debris.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
debris.setAttribute('color',new T.BufferAttribute(colors,3).setUsage(T.DynamicDrawUsage));
const sparks=new T.Points(debris,new T.PointsMaterial({size:.077,vertexColors:true,depthWrite:false}));sparks.frustumCulled=false;scene.add(sparks);
let sparkIndex=0;
function burst(p,n,destruction) {
  for(let j=0;j<n;j++){
    const i=sparkIndex++%capacity,o=i*3;
    positions.set([p.x,p.y,p.z],o);velocities.set([(Math.random()-.5)*5,Math.random()*4+.2,(Math.random()-.5)*5],o);
    lives[i]=.18+Math.random()*.43;
    colors.set(destruction?[1,.10+Math.random()*.38,.035]:[.52+Math.random()*.45,1,.20],o);
  }
  debris.attributes.color.needsUpdate=true;
}
function stepSparks(dt) {
  for(let i=0;i<capacity;i++)if(lives[i]>0){
    lives[i]-=dt;const o=i*3;
    if(lives[i]<=0){positions[o+1]=-999;continue;}
    velocities[o+1]-=dt*7;
    for(let d=0;d<3;d++)positions[o+d]+=velocities[o+d]*dt;
  }
  debris.attributes.position.needsUpdate=true;
}
const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
let best=Number(read('bsc-defense.best',0))||0,muted=read('bsc-defense.muted','false')==='true';
let audio;
function armAudio(){
  try{const Context=window.AudioContext||window.webkitAudioContext;if(!audio&&Context)audio=new Context();audio?.resume().catch(()=>{});}catch{}
}
function tone(a,b,d,type='sine',volume=.06,wait=0){
  if(muted||!audio||audio.state!=='running')return;
  const t=audio.currentTime+wait,osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=type;osc.frequency.setValueAtTime(a,t);osc.frequency.exponentialRampToValueAtTime(b,t+d);
  gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+d);
  osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+d+.01);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
function syncSound(){$('audio').setAttribute('aria-pressed',String(muted));$('audio').setAttribute('aria-label',muted?'Enable sound':'Mute sound');}
$('audio').onclick=()=>{muted=!muted;write('bsc-defense.muted',muted);armAudio();syncSound();tone(400,600,.07);};
syncSound();
const pad=n=>String(n).padStart(6,'0');
$('best').textContent=pad(best);
let mode='menu',view='aisle',phase=0,elapsed=0,score=0,hp=100,wave=1,kills=0,streak=0,lastKill=-8;
let step=0,height=0,vertical=0,recoil=0,shake=0,hitmark=0,pointsTimer=0,toastTimer=0,damage=0,spawnTimer=0,fireDelay=0,beamLife=0,fireHeld=false;
let previous=performance.now();
let pixelCap=Math.min(devicePixelRatio,touchCapable?1.45:1.75),slowSeconds=0;
const keys=new Set(),stick={x:0,y:0};let stickId=null,lookId=null,fireId=null,dragX=0,dragY=0;
const previewBots=[[.8,8.9,1.27],[-1.33,1.9,1.02],[1.5,-6.8,1.04]];
function resize(){
  renderer.setPixelRatio(pixelCap);renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  gun.group.scale.setScalar(camera.aspect<.85?.55:.86);
  camera.clearViewOffset();
  if(mode==='menu'){
    const portrait=innerWidth/innerHeight<.85;
    camera.setViewOffset(innerWidth,innerHeight,portrait?0:-innerWidth*.17,portrait?innerHeight*.18:0,innerWidth,innerHeight);
  }
  camera.updateProjectionMatrix();
}
function setMode(next){
  mode=next;document.body.dataset.mode=mode;
  gun.group.visible=mode==='play';
  if(mode!=='play')clearInputs();
  if(mode!=='menu'){
    $('tag').style.display='none';
    const p=camera.position;
    $('zone-name').textContent=Math.abs(p.x)<10 && Math.abs(p.z)<19?'COMPUTE HALL':'SERVICE YARD';
  }
  if(mode==='play')canvas.focus({preventScroll:true});
  resize();
}
function clearInputs(){
  keys.clear();stick.x=stick.y=0;stickId=lookId=fireId=null;fireHeld=false;$('stick').firstElementChild.style.transform='';
}
function switchView(){
  view=view==='aisle'?'yard':'aisle';
  $('view').setAttribute('aria-pressed',String(view==='yard'));
  $('view').textContent=view==='aisle'?'View exterior':'View aisle';
  $('feed-name').textContent=view==='aisle'?'LIVE AISLE FEED':'LIVE YARD FEED';
  $('zone-name').textContent=view==='aisle'?'COMPUTE HALL':'COOLING YARD';
  menuCamera();
}
$('view').onclick=switchView;
function menuCamera(){
  const t=phase*.15,portrait=camera.aspect<.85;
  if(view==='yard'){
    camera.position.set(-28+Math.sin(t)*1.3,16.2,-40.5);camera.lookAt(0,3,0);
  }else{
    camera.position.set(-.64+Math.sin(t)*.12,portrait?1.83:1.65,portrait?15.2:14.65);
    camera.lookAt(.3,1.74,-9.2);
  }
  camera.updateMatrixWorld();
}
function menuPose(dt){
  menuCamera();
  for(let i=0;i<previewBots.length;i++){
    const b=bots[i],v=previewBots[i];b.root.visible=true;b.root.position.set(v[0],0,v[1]);b.root.scale.setScalar(v[2]);b.root.rotation.y=-.54+.10*Math.sin(phase*.55+i);
    b.pose(phase*2+i,false);
  }
  if(view==='aisle' && camera.aspect>.85){
    const b=bots[0],p=b.root.position;
    const top=tmp.set(p.x,2.2,p.z).project(camera).clone(),base=tmp.set(p.x,0,p.z).project(camera);
    const h=(top.y-base.y)*innerHeight/2,w=h*.92;
    const tag=$('tag');tag.style.cssText='display:block;left:'+((top.x+1)*innerWidth/2-w/2)+'px;top:'+((1-top.y)*innerHeight/2-4)+'px;width:'+w+'px;height:'+(h+10)+'px';
  }else $('tag').style.display='none';
}
function hud(){
  $('score').textContent=pad(score);$('wave').textContent=String(wave).padStart(2,'0');
  $('health-value').textContent=hp;$('health-fill').style.width=hp+'%';$('health-fill').style.background=hp<30?'#ff735a':'var(--lime)';
  const left=Math.max(0,Math.ceil(180-elapsed));$('timer').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');
}
function toast(message,seconds=1.6){$('toast').textContent=message;toastTimer=seconds;}
function spawn(bot,x,z){
  bot.active=true;bot.root.visible=true;bot.root.position.set(x,0,z);bot.root.scale.setScalar(1);bot.hp=wave===1?2:3;
  bot.speed=1.55+wave*.26+Math.random()*.40;bot.clock=Math.random()*6;bot.warn=bot.hit=bot.delay=0;
  bot.armor.emissive.setHex(0);bot.root.rotation.y=Math.atan2(camera.position.x-x,camera.position.z-z);
}
function newRun(){
  elapsed=score=kills=height=vertical=recoil=shake=hitmark=pointsTimer=damage=fireDelay=beamLife=streak=step=0;
  $('damage').style.opacity=0;lastKill=-8;hp=100;wave=1;spawnTimer=2.5;
  lives.fill(0);positions.fill(-999);debris.attributes.position.needsUpdate=true;beam.visible=false;gun.flash.visible=false;
  for(const b of bots){b.active=false;b.root.visible=false;b.armor.emissive.setHex(0);}
  camera.clearViewOffset();camera.position.set(0,1.6,13.5);camera.rotation.set(-.035,0,0,'YXZ');camera.updateMatrixWorld();
  spawn(bots[0],0,3.5);spawn(bots[1],-1.7,-3.2);spawn(bots[2],1.6,-11.3);
  hud();toast('WAVE 01   /   HOLD THE HALL',2.2);
}
function enter(){
  armAudio();
  if(mode!=='paused')newRun();
  setMode('play');previous=performance.now();
  if(!touchCapable && canvas.requestPointerLock){
    // Captured mouse is preferred; drag-to-look remains usable in an embedded or restricted browser.
    try{const result=canvas.requestPointerLock();result?.catch?.(()=>{if(mode==='play')toast('DRAG TO LOOK  /  HOLD TO FIRE',3);});}catch{toast('DRAG TO LOOK  /  HOLD TO FIRE',3);}
  }
  tone(300,660,.14,'sine',.055);
}
function overlay(label,first,second,brief,action){
  $('mode-label').textContent=label;$('title').firstElementChild.textContent=first;$('title').lastElementChild.textContent=second;
  $('brief').textContent=brief;$('launch-text').textContent=action;$('launch').focus({preventScroll:true});
}
function pause(){
  if(mode!=='play')return;setMode('paused');if(document.pointerLockElement)document.exitPointerLock();
  overlay('RUN PAUSED','ON','STANDBY','Your run is paused. Resume to return to the hall or continue around the yard.','Resume defense');
}
function finish(win){
  if(mode!=='play')return;
  if(win)score+=500+hp*5;
  best=Math.max(best,score);write('bsc-defense.best',best);$('best').textContent=pad(best);
  setMode(win?'victory':'overrun');if(document.pointerLockElement)document.exitPointerLock();
  overlay(win?'RUN COMPLETE':'RUN ENDED',win?'SITE':'AISLE',win?'SECURED':'OVERRUN',score.toLocaleString()+' points · '+kills+(kills===1?' bot':' bots')+' disabled · '+Math.floor(elapsed)+' seconds held.','Run it back');
  tone(win?440:160,win?670:45,.42,'triangle',.085);
}
$('launch').onclick=enter;$('pause').onclick=pause;
controls.addEventListener('unlock',()=>{if(mode==='play')pause();});
canvas.addEventListener('pointerlockerror',()=>{if(mode==='play')toast('DRAG TO LOOK  /  HOLD TO FIRE',3);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('blur',pause);
function jump(){if(mode==='play' && height<=.015){vertical=6.15;tone(150,220,.11,'sine',.035);}}
document.addEventListener('keydown',e=>{
  if(mode!=='play')return;
  if(['Space','ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Escape'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'||e.code==='KeyP'){pause();return;}
  keys.add(e.code);if(e.code==='Space' && !e.repeat)jump();
});
document.addEventListener('keyup',e=>keys.delete(e.code));
function look(dx,dy,factor){camera.rotation.y-=dx*factor;camera.rotation.x=T.MathUtils.clamp(camera.rotation.x-dy*factor,-1.37,1.37);}
canvas.tabIndex=-1;
canvas.setAttribute('aria-label','First-person game view');
canvas.addEventListener('pointerdown',e=>{
  if(mode!=='play'||touchCapable||e.button!==0)return;
  fireHeld=true;shoot();if(!document.pointerLockElement){lookId=e.pointerId;canvas.setPointerCapture(e.pointerId);dragX=e.clientX;dragY=e.clientY;}
});
canvas.addEventListener('pointermove',e=>{if(mode==='play' && !document.pointerLockElement && e.pointerId===lookId){look(e.clientX-dragX,e.clientY-dragY,.004);dragX=e.clientX;dragY=e.clientY;}});
document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){fireHeld=false;lookId=null;}});
function bindPad(element,start,move,end){
  element.addEventListener('pointerdown',e=>{if(mode!=='play')return;e.preventDefault();element.setPointerCapture(e.pointerId);start(e);});
  element.addEventListener('pointermove',move);
  for(const ev of ['lostpointercapture','pointercancel','pointerup'])element.addEventListener(ev,end);
}
function stickMove(e){
  if(e.pointerId!==stickId)return;
  const b=$('stick').getBoundingClientRect(),r=b.width*.34,dx=(e.clientX-b.x-b.width/2)/r,dy=(e.clientY-b.y-b.height/2)/r,n=Math.max(1,Math.hypot(dx,dy));
  stick.x=dx/n;stick.y=dy/n;$('stick').firstElementChild.style.transform='translate('+stick.x*r+'px,'+stick.y*r+'px)';
}
bindPad($('stick'),e=>{if(stickId===null){stickId=e.pointerId;stickMove(e);}},stickMove,e=>{if(e.pointerId===stickId){stickId=null;stick.x=stick.y=0;$('stick').firstElementChild.style.transform='';}});
bindPad($('look-pad'),e=>{if(lookId===null){lookId=e.pointerId;dragX=e.clientX;dragY=e.clientY;}},e=>{if(e.pointerId===lookId){look(e.clientX-dragX,e.clientY-dragY,.0052);dragX=e.clientX;dragY=e.clientY;}},e=>{if(e.pointerId===lookId)lookId=null;});
bindPad($('fire'),e=>{fireId=e.pointerId;fireHeld=true;shoot();},()=>{},e=>{if(e.pointerId===fireId){fireHeld=false;fireId=null;}});
bindPad($('jump'),jump,()=>{},()=>{});
function slide(p,dx,dz,r){
  if(nav.open(p.x+dx,p.z,r))p.x+=dx;
  if(nav.open(p.x,p.z+dz,r))p.z+=dz;
}
function walk(dt){
  const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+stick.x;
  const z=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+stick.y;
  const yaw=camera.rotation.y,n=Math.max(1,Math.hypot(x,z));
  const speed=dt*(keys.has('ShiftLeft')?6.4:5.15)/n;
  slide(camera.position,(x*Math.cos(yaw)+z*Math.sin(yaw))*speed,(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed,.34);
  vertical-=17*dt;height=Math.max(0,height+vertical*dt);if(!height)vertical=0;
  step+=dt*Math.min(1,Math.hypot(x,z))*10;
  camera.position.y=1.62+height+Math.sin(step)*.024*Math.min(1,Math.hypot(x,z))+Math.sin(phase*58)*shake*.045;
  camera.updateMatrixWorld();
}
const botBox=new T.Box3(),marker=new T.Vector3(),impact=new T.Vector3(),muzzle=new T.Vector3();
function shoot(){
  if(mode!=='play'||fireDelay>0)return;
  fireDelay=.18;recoil=1;beamLife=.068;gun.flash.visible=true;
  camera.updateMatrixWorld(true);ray.setFromCamera(aim,camera);
  let range=64,target=null;
  for(const box of world.colliders){const p=ray.ray.intersectBox(box,marker);if(p)range=Math.min(range,ray.ray.origin.distanceTo(p));}
  for(const b of bots)if(b.active){
    const p=b.root.position;
    botBox.min.set(p.x-.62,.03,p.z-.40);botBox.max.set(p.x+.62,1.71,p.z+.40);
    const hit=ray.ray.intersectBox(botBox,marker);
    if(hit){const d=ray.ray.origin.distanceTo(hit);if(d<range){target=b;range=d;}}
  }
  if(ray.ray.direction.y<0){const floorHit=-camera.position.y/ray.ray.direction.y;if(floorHit<range){range=floorHit;target=null;}}
  ray.ray.at(range,impact);gun.flash.getWorldPosition(muzzle);beam.position.copy(muzzle).lerp(impact,.5);
  direction.subVectors(impact,muzzle);beam.scale.y=direction.length();beam.quaternion.setFromUnitVectors(tmp.set(0,1,0),direction.normalize());beam.visible=true;
  tone(490,72,.105,'sawtooth',.035);if(range<63)burst(impact,target?9:4,false);
  if(!target)return;
  hitmark=.14;target.hit=.13;target.hp--;tone(700,530,.055,'triangle',.045);
  if(target.hp>0)return;
  target.active=false;target.root.visible=false;kills++;
  streak=elapsed-lastKill<3.6?Math.min(4,streak+1):1;lastKill=elapsed;
  const award=100*streak;score+=award;pointsTimer=.72;
  $('popup').textContent='+'+award+(streak>1?'  ×'+streak:'');
  burst(impact,28,true);tone(110,33,.19,'sawtooth',.085);hud();
}
function attack(bot,dt,dist){
  bot.warn-=dt;
  if(bot.warn>0)return;
  if(dist<2.2 && height<.82 && nav.clearSegment(bot.root.position.x,bot.root.position.z,camera.position.x,camera.position.z,.04)){
    hp=Math.max(0,hp-11);shake=1;damage=.68;tone(115,45,.22,'square',.055);hud();
    if(!hp)finish(false);
  }
  bot.delay=1.0;
}
function updateBots(dt){
  const me=camera.position;nav.update(me.x,me.z);
  let count=0;
  for(const b of bots){
    if(!b.active || mode!=='play')continue;count++;
    const p=b.root.position,dx=me.x-p.x,dz=me.z-p.z,dist=Math.hypot(dx,dz);
    b.hit=Math.max(0,b.hit-dt);b.delay=Math.max(0,b.delay-dt);
    if(b.warn>0)attack(b,dt,dist);
    else if(dist<1.7 && b.delay===0 && nav.clearSegment(p.x,p.z,me.x,me.z,.08)){
      b.warn=.53;tone(260,480,.18,'triangle',.025);
    }else if(dist>1.05){
      const [tx,tz]=nav.nextStep(p.x,p.z,me.x,me.z);
      let vx=tx-p.x,vz=tz-p.z;const n=Math.hypot(vx,vz)||1;vx/=n;vz/=n;
      for(const other of bots)if(other.active && other!==b){
        const ox=p.x-other.root.position.x,oz=p.z-other.root.position.z,d=Math.hypot(ox,oz);
        if(d>0 && d<.94){vx+=ox/d*(.94-d)*1.7;vz+=oz/d*(.94-d)*1.7;}
      }
      const magnitude=Math.max(1,Math.hypot(vx,vz)),v=Math.min(b.speed*dt,n);
      slide(p,vx*v/magnitude,vz*v/magnitude,.37);
      if(vx||vz)b.root.rotation.y=Math.atan2(vx,vz);
    }
    b.clock+=dt*(dist>1.65?7:3);b.pose(b.clock,dist>1.65);
    b.armor.emissive.setHex(b.hit>0?0xffd9af:b.warn>0?0xed3e0e:0x000000);
  }
  spawnTimer-=dt;
  if(spawnTimer>0||count>=3+wave*2)return;
  const idle=bots.find(b=>!b.active);if(!idle)return;
  const angle=new T.Euler(0,camera.rotation.y,0,'YXZ');
  for(let i=0;i<22;i++){
    const a=(Math.random()-.5)*(i<13?1.8:Math.PI*2),distance=11+Math.random()*9;
    tmp.set(Math.sin(a)*distance,0,-Math.cos(a)*distance).applyEuler(angle).add(me);
    if(nav.open(tmp.x,tmp.z,.65)){spawn(idle,tmp.x,tmp.z);spawnTimer=wave===1?2.7:wave===2?2.05:1.5;break;}
  }
}
function update(dt){
  if(elapsed>=180){finish(true);return;}
  const nextWave=1+Math.floor(elapsed/60);
  if(nextWave!==wave){wave=nextWave;hp=Math.min(100,hp+25);toast('WAVE 0'+wave+'   /   +25 REPAIR',2.6);tone(410,690,.24);}
  fireDelay=Math.max(0,fireDelay-dt);beamLife-=dt;
  walk(dt);if(fireHeld)shoot();updateBots(dt);
  if(mode!=='play')return;
  beam.visible=beamLife>0;beam.material.opacity=Math.max(0,beamLife/.068);gun.flash.visible=beamLife>.018;
  recoil=Math.max(0,recoil-dt*8);shake=Math.max(0,shake-dt*2.8);damage=Math.max(0,damage-dt*2.0);
  gun.group.position.set(Math.min(.29,.27*camera.aspect)+Math.sin(step*.5)*.009,(camera.aspect<.85?-.27:-.24)+Math.cos(step)*.006,-.47+recoil*.085);
  gun.group.rotation.x=recoil*.105;
  hitmark=Math.max(0,hitmark-dt);pointsTimer=Math.max(0,pointsTimer-dt);toastTimer=Math.max(0,toastTimer-dt);
  $('hitmark').style.opacity=hitmark>0?1:0;$('popup').style.opacity=Math.min(1,pointsTimer*5);$('toast').style.opacity=Math.min(1,toastTimer*3);$('damage').style.opacity=damage;
  stepSparks(dt);hud();
}
function frame(now){
  const raw=(now-previous)/1000;previous=now;
  const dt=Math.min(.25,Math.max(0,raw));phase+=dt;world.update(dt);
  if(mode==='menu')menuPose(dt);
  if(mode==='play'){
    elapsed=Math.min(180,elapsed+Math.max(0,raw));
    let left=dt;
    while(left>0.00001 && mode==='play'){const slice=Math.min(.032,left);update(slice);left-=slice;}
  }
  // Reduce fill rate on consistently slow devices without lowering simulation tick precision.
  if(raw>.037&&raw<.30)slowSeconds+=dt;else slowSeconds=Math.max(0,slowSeconds-dt*.6);
  if(slowSeconds>3 && pixelCap>.8){pixelCap=Math.max(.8,pixelCap*.8);slowSeconds=0;resize();}
  renderer.render(scene,camera);requestAnimationFrame(frame);
}
window.addEventListener('resize',resize);
setMode('menu');menuPose(0);renderer.render(scene,camera);
$('launch-text').textContent='Launch defense';$('launch').disabled=false;
requestAnimationFrame(frame);
