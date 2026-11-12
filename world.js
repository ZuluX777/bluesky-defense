import * as T from 'three';
import { mergeGeometries } from './vendor/geometry.js';

export const bounds = { x: 24, z: 34 };
const box = new T.BoxGeometry(1, 1, 1);
const plane = new T.PlaneGeometry(1, 1);
const cylinder = new T.CylinderGeometry(0.5, 0.5, 1, 20);
const scratch = new T.Object3D();
const up = new T.Vector3(0, 1, 0);
const color = hex => new T.Color(hex);
const solid = hex => new T.MeshStandardMaterial({color:hex, roughness:.71, metalness:.19});
const lit = hex => new T.MeshBasicMaterial({color:hex});
function texture(w,h,draw) {
  const canvas = document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  draw(canvas.getContext('2d'),w,h);
  const tex=new T.CanvasTexture(canvas);
  tex.colorSpace=T.SRGBColorSpace;
  tex.anisotropy=4;
  return tex;
}
function randomSequence(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}
function faceTexture(cdu,emission) {
  return texture(256,512,(c,w,h)=>{
    c.fillStyle=emission?'black':'#0e1b26';c.fillRect(0,0,w,h);
    const rect=(x,y,w,h,ink)=>{c.fillStyle=ink;c.fillRect(x,y,w,h);};
    if(!emission) {
      rect(4,4,248,504,'#293a46');rect(10,9,236,494,'#111d26');
      rect(23,13,211,38,cdu?'#216b71':'#203341');
      c.fillStyle='#dae5e1';c.font='bold 16px monospace';c.fillText(cdu?'CDU  /  LOOP':'GB300 NVL72',31,37);
      rect(22,486,204,8,'#435562');
      for(const x of [9,243]){rect(x,55,3,424,'#487e9e');for(let j=17;j<h;j+=43)rect(x-2,j,5,3,'#89969c');}
    }
    const rand=randomSequence(cdu?95:82);
    if(cdu){
      if(!emission){
        rect(22,59,212,411,'#1a454e');rect(36,83,120,83,'#0f212a');rect(43,90,106,64,'#273c43');
        for(let i=0;i<27;i++)rect(40,205+i*9,172,4,'#0c272f');
        rect(202,117,9,41,'#60777b');
      }
      rect(50,100,70,9,'#71e5c1');rect(50,119,38,3,'#61baba');return;
    }
    for(let row=0;row<17;row++){
      const y=59+row*25;
      if(!emission){
        rect(17,y,222,23,'#25333c');rect(20,y+2,216,2,'#51606a');rect(27,y+5,201,15,'#111a22');
        for(let a=0;a<32;a++){rect(33+a*3,y+7,1,9,'#495760');}
        for(let a=0;a<5;a++){rect(139+a*14,y+8,10,7,'#33424a');rect(141+a*14,y+9,6,3,'#091319');}
        rect(22,y+6,3,10,'#7e9099');
      }
      if(row%5!==3){
        const intensity=rand();const ink=intensity>.5?'#a8ff58':'#68db52';
        rect(31,y+3,128+Math.floor(rand()*47),3,ink);
        for(let a=0;a<4;a++)rect(206+a*5,y+7,3,4,rand()>.2?ink:'#417d44');
      }else {rect(31,y+3,60,2,'#449ad1');}
    }
  });
}
function groundTexture() {
  return texture(512,512,(c,w,h)=>{
    const rand=randomSequence(57);const pixels=c.createImageData(w,h);
    for(let i=0;i<pixels.data.length;i+=4){const n=rand()*13;pixels.data[i]=47+n;pixels.data[i+1]=60+n;pixels.data[i+2]=67+n;pixels.data[i+3]=255;}
    c.putImageData(pixels,0,0);
    c.fillStyle='#23353e';c.fillRect(0,0,512,3);c.fillRect(0,0,3,512);
    c.fillStyle='#607179';c.fillRect(3,3,509,1);c.fillRect(3,3,1,509);
    for(let i=0;i<80;i++){c.fillStyle='#ffffff0b';c.fillRect(rand()*512,rand()*512,rand()*55,1);}
    for(const x of [11,501])for(const y of [11,501]){c.fillStyle='#15252d';c.fillRect(x-2,y-2,4,4);}
  });
}
function labelMap(text, bg, ink) {
  return texture(512,96,c=>{c.fillStyle=bg;c.fillRect(0,0,512,96);c.fillStyle=ink;c.font='bold 44px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,50);});
}
const footprint = (x,z,w,d,h=8) => new T.Box3(new T.Vector3(x-w/2,0,z-d/2),new T.Vector3(x+w/2,h,z+d/2));
export function makeWorld(scene) {
  const colliders=[],batches=new Map(),rotors=[];
  const mat={steel:solid('#526574'),dark:solid('#162631'),frame:solid('#3c5363'),blue:solid('#194465'),teal:solid('#337c82'),orange:solid('#ca792e'),metal:solid('#8d9da4'),rubber:solid('#14202a'),white:lit('#cce5ed'),amber:lit('#ffb850'),line:solid('#d3a447'),concrete:solid('#777f7f')};
  function stamp(geo,material,x,y,z,w,h,d,rx=0,ry=0,rz=0){
    const key=geo.uuid+material.uuid;
    if(!batches.has(key))batches.set(key,{geo,material,matrices:[]});
    scratch.position.set(x,y,z);scratch.rotation.set(rx,ry,rz);scratch.scale.set(w,h,d);scratch.updateMatrix();
    batches.get(key).matrices.push(scratch.matrix.clone());
  }
  const block=(m,...args)=>stamp(box,m,...args);
  const pole=(m,a,b,r)=>{
    const dir=new T.Vector3(...b).sub(new T.Vector3(...a));
    scratch.quaternion.setFromUnitVectors(up,dir.clone().normalize());
    const e=new T.Euler().setFromQuaternion(scratch.quaternion);
    stamp(cylinder,m,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,r*2,dir.length(),r*2,e.x,e.y,e.z);
  };
  function wall(m,x,y,z,w,h,d){block(m,x,y,z,w,h,d);colliders.push(footprint(x,z,w,d,y+h/2));}
  function sign(words,x,y,z,w,h,angle=0){
    const m=new T.MeshBasicMaterial({map:labelMap(words,'#233742','#c7ddd9')});
    stamp(plane,m,x,y,z,w,h,1,0,angle);
  }
  const floorMap=groundTexture();floorMap.wrapS=floorMap.wrapT=T.RepeatWrapping;floorMap.repeat.set(28,40);
  const ground=new T.Mesh(new T.PlaneGeometry(132,188),new T.MeshStandardMaterial({map:floorMap,roughness:.86,metalness:.09}));
  ground.rotation.x=-Math.PI/2;scene.add(ground);
  // The hall is an original arcade arena with a gray membrane and repeating aluminum arch frames.
  const shell=solid('#899aa2');shell.side=T.DoubleSide;
  const arch=[[-10,0],[-10,3.25],[-9.65,4.55],[-8.85,5.55],[-7.4,6.35],[0,9.9],[7.4,6.35],[8.85,5.55],[9.65,4.55],[10,3.25],[10,0]];
  for(let i=0;i<arch.length-1;i++){
    const [ax,ay]=arch[i],[bx,by]=arch[i+1];const length=Math.hypot(ax-bx,ay-by);
    block(shell,(ax+bx)/2,(ay+by)/2,0,length,.12,38,0,0,Math.atan2(by-ay,bx-ax));
    for(let s=0;s<=10;s++){
      const z=-19+s*3.8;
      block(mat.metal,(ax+bx)/2,(ay+by)/2,z,length,.23,.16,0,0,Math.atan2(by-ay,bx-ax));
    }
  }
  for(const side of [-1,1])colliders.push(footprint(side*10,0,.34,38,3.5));
  for(const side of [-1,1]){
    const z=side*19;
    for(let i=0;i<40;i++){
      const x=-9.75+i*.5;
      const ax=Math.abs(x);
      const roof= ax<=7.4?9.9-ax*.48:ax<8.85?6.35-(ax-7.4)*.55:ax<9.65?5.55-(ax-8.85)*1.25:4.45-(ax-9.65)*3.2;
      const bottom=ax<3?4.2:0;block(shell,x,(roof+bottom)/2,z,.507,roof-bottom,.11);
    }
    for(const x of [-6.5,6.5])colliders.push(footprint(x,z,7,.24,8));
    for(const x of [-3.06,3.06]){
      block(mat.frame,x,2.1,z,.19,4.2,.36);block(mat.amber,x,3.78,z+side*.19,.1,.2,.05);
    }
    block(mat.frame,0,4.24,z,6.32,.25,.46);
    for(let j=0;j<5;j++)block(mat.metal,0,4.46+j*.1,z+side*.1,5.95,.07,.15);
    sign('BLUESKY  /  COMPUTE',0,5.7,z+side*.14,4.5,.66,side<0?Math.PI:0);
    for(const x of [-7,7]){
      block(mat.frame,x,1.3,z+side*.11,1.4,2.6,.12);
      block(mat.teal,x,1.22,z+side*.19,1.2,2.37,.06);
      block(mat.metal,x,2.85,z+side*.74,2.5,.14,1.6,-side*.12);
    }
  }
  const racks=[false,true].map(cdu=>new T.MeshStandardMaterial({map:faceTexture(cdu,false),emissiveMap:faceTexture(cdu,true),emissive:0xffffff,emissiveIntensity:1.18,metalness:.15,roughness:.64}));
  for(const side of [-1,1]){
    for(let i=0;i<14;i++){
      const z=-14.95+i*2.3, x=side*4.19, cdu=(i===3||i===10);
      block(mat.rubber,x,.11,z,1.9,.22,2.2);
      block(cdu?mat.teal:mat.dark,x,2.04,z,1.78,3.79,2.17);
      block(mat.frame,x,3.97,z,1.84,.13,2.21);
      stamp(plane,racks[Number(cdu)],side*3.292,2.05,z,2.12,3.73,1,0,-side*Math.PI/2);
      for(const dz of [-1.025,1.025])block(mat.blue,side*3.27,2.05,z+dz,.085,3.81,.07);
      block(mat.metal,x,4.23,z,.08,.44,.09);
    }
    colliders.push(footprint(side*4.19,0,1.94,32.3,4.04));
    for(const [offset,y,m,r] of [[4.04,4.65,mat.orange,.09],[4.36,4.9,mat.teal,.12],[5.33,4.79,mat.blue,.14]]){
      pole(m,[side*offset,y,-16.7],[side*offset,y,16.7],r);
      for(let z=-15;z<=15;z+=3.8)stamp(cylinder,mat.metal,side*offset,y,z,r*2.5,.09,r*2.5,Math.PI/2);
    }
    block(mat.frame,side*2.95,5.08,0,.23,.14,34);
    for(let z=-15;z<=16;z+=3.8){
      block(mat.white,side*2.95,4.99,z,.15,.045,2.85);
      block(mat.steel,0,5.18,z,8.8,.1,.12);
      for(const x of [2.95,5.35])pole(mat.steel,[side*x,5.12,z],[side*x,9.9-x*.48,z],.032);
    }
    block(mat.line,side*2.86,.013,0,.05,.016,34);
    for(let z=-16;z<17;z+=2.3)block(mat.line,side*2.72,.017,z,.16,.018,.39);
  }
  // Floor light spill is baked into a small procedural texture, including the rack reflections.
  const reflection=texture(128,256,(c,w,h)=>{
    const g=c.createLinearGradient(0,0,w,0);g.addColorStop(0,'rgba(91,255,91,0)');g.addColorStop(.72,'rgba(98,237,100,.22)');g.addColorStop(1,'rgba(127,252,76,.04)');c.fillStyle=g;c.fillRect(0,0,w,h);
    for(let i=0;i<10;i++){c.fillStyle='rgba(28,50,65,.3)';c.fillRect(0,i*27,w,7);}
  });
  const refl=new T.MeshBasicMaterial({map:reflection,transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  for(const side of [-1,1])for(let i=0;i<14;i++)stamp(plane,refl,side*2.16,.027,-14.95+i*2.3,2.3,2.18,1,-Math.PI/2,0,side>0?0:Math.PI);
  // Fan banks are visible through the hall doors and have walkable service lanes between them.
  const grille=new T.MeshStandardMaterial({color:0x596d77,roughness:.65});
  const ring=new T.TorusGeometry(.5,.037,6,26);
  const bladeMat=solid('#73929b');
  function fan(x,y,z,r,top=false){
    const pivot=new T.Group();pivot.position.set(x,y,z);if(top)pivot.rotation.x=-Math.PI/2;
    const rotor=new T.Group();pivot.add(rotor);
    const disc=new T.Mesh(cylinder,mat.dark);disc.rotation.x=Math.PI/2;disc.scale.set(r*2,.12,r*2);pivot.add(disc);
    const bladeGeometry=new T.Shape();bladeGeometry.moveTo(0,0);bladeGeometry.quadraticCurveTo(.15,.28,.06,.85);bladeGeometry.quadraticCurveTo(.54,.76,.43,.48);bladeGeometry.lineTo(.18,.07);bladeGeometry.closePath();
    const blade=new T.ShapeGeometry(bladeGeometry,4);
    const parts=[];
    for(let i=0;i<7;i++){const g=blade.clone();g.scale(r,r,1);g.rotateZ(i*Math.PI*2/7);parts.push(g);}
    const fins=new T.Mesh(mergeGeometries(parts),bladeMat);fins.position.z=.08;rotor.add(fins);parts.forEach(g=>g.dispose());blade.dispose();
    const rim=new T.Mesh(ring,grille);rim.scale.setScalar(r*2);rim.position.z=.12;pivot.add(rim);
    const hub=new T.Mesh(cylinder,mat.metal);hub.rotation.x=Math.PI/2;hub.scale.set(r*.38,.16,r*.38);hub.position.z=.11;pivot.add(hub);
    scene.add(pivot);rotors.push(rotor);
  }
  const contact=new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.80});
  for(const side of [-1,1])for(let z=-15;z<=16;z+=2.3)stamp(plane,contact,side*4.0,.031,z,3.2,3.5,1,-Math.PI/2);
  for(const x of [-10.5,0,10.5]){
    const z=-26.5;stamp(plane,contact,x+.5,.025,z+.3,8.6,7.7,1,-Math.PI/2);
    block(mat.concrete,x,.12,z,5.55,.24,5.6);wall(mat.frame,x,1.25,z,5.12,2.1,5.2);block(mat.metal,x,2.41,z,5.3,.24,5.42);
    for(const dx of [-1.28,1.28]){fan(x+dx,1.35,z+2.68,.93);fan(x+dx,2.57,z,1.05,true);}
    for(const side of [-1,1])for(let j=0;j<11;j++)block(mat.dark,x+side*2.58,1.13,z-2.22+j*.44,.05,1.4,.16);
  }
  for(const x of [-16.4,16.4]){
    for(const z of [4,12]){
      wall(mat.frame,x,1.48,z,2.9,2.96,3.75);
      for(let i=0;i<9;i++)block(mat.metal,x,1.4,z-1.66+i*.4,3.15,1.99,.12);
      for(const dx of [-.78,0,.78]){stamp(cylinder,mat.rubber,x+dx,3.24,z, .16,.57,.16);stamp(cylinder,mat.orange,x+dx,3.45,z,.25,.13,.25);}
    }
  }
  for(const z of [-21.1,21.1])for(const x of [-3.9,3.9]){
    stamp(cylinder,mat.line,x,.52,z,.19,1.04,.19);stamp(cylinder,mat.rubber,x,.76,z,.20,.21,.20);
    colliders.push(footprint(x,z,.2,.2,1.04));
  }
  for(const side of [-1,1]){
    for(let z=-32;z<33;z+=8)block(mat.line,side*13.5,.012,z,.095,.015,4.3);
    for(let z=-32;z<=32;z+=16){
      const x=side*23.8;block(mat.frame,x,3.4,z,.12,6.8,.12);block(mat.metal,x-side*.6,6.75,z,1.3,.16,.28);block(mat.white,x-side*1.05,6.65,z,.42,.07,.24);
    }
    block(mat.concrete,side*24.8,.64,0,.55,1.28,69.8);block(mat.line,side*24.8,1.3,0,.56,.10,69.8);
    block(mat.concrete,0,.64,side*34.8,50,1.28,.55);block(mat.line,0,1.3,side*34.8,50,.10,.56);
  }
  const rand=randomSequence(235);
  for(let i=0;i<33;i++){
    const a=rand()*Math.PI*2,r=50+rand()*27,x=Math.cos(a)*r,z=Math.sin(a)*r;
    const w=4+rand()*7,h=2+rand()*4,d=5+rand()*5;block(mat.frame,x,h/2,z,w,h,d);block(mat.metal,x,h+.08,z,w+.3,.16,d+.3);
  }
  // Tree silhouettes and a low belt of hills place the yard in a rural landscape.
  const foliage=solid('#364f55'),leaves=solid('#526962'),terrain=solid('#617b80');
  const hill=new T.IcosahedronGeometry(1,1),crown=new T.IcosahedronGeometry(1,0);
  for(let i=0;i<34;i++){
    const a=i/34*Math.PI*2,r=82+rand()*4;
    stamp(hill,terrain,Math.cos(a)*r,-2,Math.sin(a)*r,17+rand()*8,6+rand()*7,15,0,rand()*4);
  }
  for(let i=0;i<110;i++){
    const a=rand()*Math.PI*2,r=42+rand()*16,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(Math.abs(x)<28 && Math.abs(z)<37)continue;
    const h=2.2+rand()*2.5;
    stamp(crown,i%3?foliage:leaves,x,h*.68,z,h*.57,h*.86,h*.62,0,rand()*4);
    block(mat.dark,x,.65,z,.24,1.3,.24);
  }
  for(const {geo,material,matrices} of batches.values()){
    const mesh=new T.InstancedMesh(geo,material,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();scene.add(mesh);
  }
  scene.background=color('#788f9f');scene.fog=new T.FogExp2('#748d9b',.013);
  scene.add(new T.HemisphereLight(0xe5f3ff,0x6a7777,1.62));
  const sun=new T.DirectionalLight(0xffe7b7,2.25);sun.position.set(-20,31,14);scene.add(sun);
  const rim=new T.DirectionalLight(0x8acbff,.75);rim.position.set(12,11,-14);scene.add(rim);
  // A skyline with an atmospheric gradient gives the outdoor circuit a horizon.
  const sky=new T.Mesh(new T.SphereGeometry(107,32,16),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:{zenith:{value:color('#35526f')},horizon:{value:color('#adbcc0')}},
    vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 p;uniform vec3 zenith,horizon;void main(){vec3 n=normalize(p);float h=smoothstep(-.04,.8,n.y);vec3 c=mix(horizon,zenith,h);float sun=pow(max(dot(n,normalize(vec3(-.55,.26,-.80))),0.),130.);gl_FragColor=vec4(c+vec3(.9,.62,.28)*sun,1.);\n#include <colorspace_fragment>\n}'
  }));scene.add(sky);
  return {colliders,update(dt){for(const r of rotors)r.rotation.z+=dt*1.25;}};
}

// Moving models share geometry. Each articulated section is batched into a single draw call.
function part(geo,ink,pos,size,rot=[0,0,0]) {
  scratch.position.set(...pos);scratch.rotation.set(...rot);scratch.scale.set(...size);scratch.updateMatrix();
  const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(scratch.matrix);
  const rgb=color(ink),n=g.attributes.position.count,values=new Float32Array(n*3);
  for(let i=0;i<n;i++)rgb.toArray(values,i*3);g.setAttribute('color',new T.BufferAttribute(values,3));
  return g;
}
function baked(parts){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;}
const ruby='#d03d32',plate='#a52d28',iron='#394951',black='#182732',trim='#b9c8c4';
function beveledHousing(){
  const s=new T.Shape();
  s.moveTo(-.38,-.5);s.lineTo(.30,-.5);s.lineTo(.5,-.26);s.lineTo(.5,.29);
  s.lineTo(.33,.5);s.lineTo(-.32,.5);s.lineTo(-.5,.27);s.lineTo(-.5,-.28);s.closePath();
  const g=new T.ExtrudeGeometry(s,{depth:.80,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.045,bevelThickness:.085});
  g.center();return g;
}
const casing=beveledHousing();
const hull=baked([
  part(box,black,[0,.91,0],[.64,.62,.57]),part(casing,ruby,[0,1.22,.02],[.88,.46,.64],[-.09,0,0]),
  part(casing,plate,[0,1.48,-.02],[.68,.13,.52]),part(casing,black,[0,1.29,.34],[.73,.22,.12],[-.12,0,0]),
  ...[-1,1].flatMap(s=>[
    part(casing,'#6e241f',[s*.55,1.25,.27],[.25,.18,.07],[0,0,s*.13]),
    part(box,'#e2a95c',[s*.55,1.28,.311],[.13,.025,.015],[0,0,s*.26]),
    part(cylinder,'#829497',[s*.36,1.10,.345],[.055,.03,.055],[Math.PI/2,0,0]),
    part(cylinder,black,[s*.41,.72,0],[.16,.22,.16],[0,0,Math.PI/2]),
    part(box,plate,[s*.263,.86,.23],[.115,.24,.19],[0,0,s*-.15])
  ]),
  ...[0,1,2,3,4].map(i=>part(box,'#46545e',[(i-2)*.084,1.06,.35],[.048,.055,.026],[0,0,-.16])),
  part(box,'#535f5e',[-.264,1.60,-.03],[.065,.25,.067],[0,0,.12]),
  part(cylinder,'#e9ae50',[-.28,1.74,-.03],[.068,.066,.068]),
  part(box,iron,[0,.83,.3],[.41,.22,.14]),part(box,trim,[0,1.45,.29],[.53,.035,.07]),
  ...[-1,1].flatMap(s=>[part(box,black,[s*.54,1.17,0],[.31,.27,.4]),part(casing,ruby,[s*.58,1.23,.02],[.29,.35,.51],[0,0,s*.17]),part(box,iron,[s*.59,.95,.09],[.18,.24,.24]),part(box,plate,[s*.58,.80,.14],[.24,.17,.27]),part(box,black,[s*.31,1.57,-.15],[.05,.25,.06],[0,0,s*-.18])])
]);
const leg=baked([part(box,iron,[0,-.13,0],[.22,.31,.23]),part(casing,ruby,[0,-.3,.05],[.28,.24,.28],[.2,0,0]),part(box,black,[0,-.49,-.02],[.15,.23,.18]),part(casing,iron,[0,-.61,.05],[.27,.12,.39])]);
const eyeGeometry=baked([part(box,'#ff492b',[0,1.3,.418],[.55,.075,.028]),part(box,'#fff0ba',[0,1.31,.436],[.32,.027,.018]),part(box,'#ff9164',[0,.84,.38],[.16,.04,.02])]);
const ledMaterial=new T.MeshBasicMaterial({vertexColors:true});
const shadowTex=texture(64,64,(c)=>{const g=c.createRadialGradient(32,32,3,32,32,31);g.addColorStop(0,'#000c');g.addColorStop(.5,'#0008');g.addColorStop(1,'#0000');c.fillStyle=g;c.fillRect(0,0,64,64);});
const shadowMat=new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false});
export function makeBot(scene){
  const root=new T.Group(),torso=new T.Group();root.add(torso);
  const armor=new T.MeshStandardMaterial({vertexColors:true,roughness:.58,metalness:.25});
  torso.add(new T.Mesh(hull,armor),new T.Mesh(eyeGeometry,ledMaterial));
  const legs=[-1,1].map(s=>{const m=new T.Mesh(leg,armor);m.position.set(s*.23,.68,0);torso.add(m);return m;});
  const shadow=new T.Mesh(plane,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;shadow.scale.set(1.65,1.1,1);root.add(shadow);scene.add(root);
  return {root,torso,armor,legs,pose(t,walking){torso.position.y=.025*Math.sin(t*2);legs.forEach((l,i)=>l.rotation.x=Math.sin(t+i*Math.PI)*(walking?.56:.06));}};
}
export function makePulser(camera){
  const group=new T.Group();
  const shell=baked([
    part(casing,'#273b4a',[0,0,-.24],[.20,.20,.60]),part(casing,'#819498',[0,.10,-.25],[.21,.065,.47]),part(box,'#18242e',[0,-.12,-.06],[.13,.23,.14],[-.28,0,0]),
    part(casing,'#15262e',[0,.13,-.12],[.14,.055,.17]),
    part(box,'#98d052',[0,.16,-.12],[.075,.006,.079]),
    ...[0,1,2].map(i=>part(casing,'#172831',[0,.11,-.34-i*.062],[.19,.071,.031])),
    part(casing,'#b77731',[0,-.012,-.42],[.22,.17,.22]),part(box,'#1b2c33',[0,0,-.58],[.16,.15,.18]),
    ...[-1,1].flatMap(s=>[part(box,'#344956',[s*.10,.02,-.29],[.05,.18,.43]),part(box,'#94a7a6',[s*.068,.075,-.60],[.036,.032,.21])])
  ]);
  group.add(new T.Mesh(shell,new T.MeshStandardMaterial({vertexColors:true,metalness:.3,roughness:.52})));
  for(let i=0;i<4;i++){const m=new T.Mesh(box,lit('#aaff54'));m.scale.set(.015,.065,.022);m.position.set(-.129,.025,-.40+i*.047);group.add(m);}
  const flash=new T.Mesh(new T.OctahedronGeometry(1),lit('#daff89'));flash.position.set(0,0,-.75);flash.scale.set(.08,.08,.19);flash.visible=false;group.add(flash);
  group.position.set(.29,-.23,-.43);group.rotation.y=-.075;camera.add(group);
  return {group,flash};
}
