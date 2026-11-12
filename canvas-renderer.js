// Lightweight depth-buffered renderer for browsers that disable WebGL. It consumes
// the same Three.js meshes, camera, textures and animations as the accelerated path.
import * as T from 'three';

const white=new T.Color(1,1,1), sunlight=new T.Vector3(-.48,.8,.35).normalize();
const clipPoint=(x,y,z,u,v)=>({x,y,z,u,v});
const linearToSrgb=n=>Math.round(255*(n<.0031308?n*12.92:1.055*Math.pow(Math.max(0,n),1/2.4)-.055));
function textureData(texture) {
  if(!texture)return null;
  const c=texture.image;
  if(!c?.width||!c.getContext)return null;
  return {pixels:c.getContext('2d').getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height,
    sx:texture.repeat.x,sy:texture.repeat.y,repeatX:texture.wrapS===T.RepeatWrapping,repeatY:texture.wrapT===T.RepeatWrapping};
}
function clipNear(poly){
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],aIn=a.z>=.045,bIn=b.z>=.045;
    if(aIn)result.push(a);
    if(aIn===bIn)continue;
    const t=(.045-a.z)/(b.z-a.z);
    result.push(clipPoint(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,.045,a.u+(b.u-a.u)*t,a.v+(b.v-a.v)*t));
  }
  return result;
}
export class CanvasRenderer {
  constructor(){
    this.domElement=document.createElement('canvas');
    this.ctx=this.domElement.getContext('2d',{alpha:false});
    this.texCache=new Map();this.models=new WeakMap();this.materials=new WeakMap();
    this.frustum=new T.Frustum();this.vp=new T.Matrix4();this.modelView=new T.Matrix4();this.worldMatrix=new T.Matrix4();this.instance=new T.Matrix4();
    this.sphere=new T.Sphere();this.normals=new T.Matrix3();this.normal=new T.Vector3();
    this.ratio=1;this.nextFrame=0;
  }
  setPixelRatio(r){this.ratio=r;}
  setSize(w,h){
    const quality=Math.min(1,this.ratio);
    const scale=Math.min(this.ratio,800*quality/w,500*quality/h);
    this.w=this.domElement.width=Math.max(1,Math.round(w*scale));
    this.h=this.domElement.height=Math.max(1,Math.round(h*scale));
    this.frame=this.ctx.createImageData(this.w,this.h);
    this.pixels=new Uint32Array(this.frame.data.buffer);this.depth=new Float32Array(this.w*this.h);
  }
  getMaterial(m){
    if(!this.materials.has(m)){
      if(m.map && !this.texCache.has(m.map))this.texCache.set(m.map,textureData(m.map));
      const c=m.color??white;
      this.materials.set(m,{r:linearToSrgb(c.r),g:linearToSrgb(c.g),b:linearToSrgb(c.b),texture:this.texCache.get(m.map)});
    }
    return this.materials.get(m);
  }
  getModel(g){
    if(this.models.has(g))return this.models.get(g);
    const pos=g.attributes.position,uv=g.attributes.uv,col=g.attributes.color,idx=g.index?.array;
    const faces=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
    for(let i=0;i<(idx?idx.length:pos.count);i+=3){
      const ia=idx?idx[i]:i,ib=idx?idx[i+1]:i+1,ic=idx?idx[i+2]:i+2;
      a.fromBufferAttribute(pos,ia);b.fromBufferAttribute(pos,ib);c.fromBufferAttribute(pos,ic);
      b.sub(a).cross(c.sub(a)).normalize();
      faces.push({ia,ib,ic,nx:b.x,ny:b.y,nz:b.z,
        r:col?linearToSrgb(col.getX(ia))/255:1,g:col?linearToSrgb(col.getY(ia))/255:1,b:col?linearToSrgb(col.getZ(ia))/255:1});
    }
    if(!g.boundingSphere)g.computeBoundingSphere();
    const vertices=Array.from({length:pos.count},(_,i)=>clipPoint(0,0,0,uv?.getX(i)??0,uv?.getY(i)??0));
    const model={faces,pos:pos.array,vertices,bound:g.boundingSphere};this.models.set(g,model);return model;
  }
  drawMesh(mesh,world,camera) {
    const model=this.getModel(mesh.geometry);
    this.sphere.copy(model.bound).applyMatrix4(world);
    if(!this.frustum.intersectsSphere(this.sphere))return;
    this.modelView.multiplyMatrices(camera.matrixWorldInverse,world);const e=this.modelView.elements;
    this.normals.getNormalMatrix(world);
    const {pos,vertices}=model;
    for(let i=0,j=0;i<vertices.length;i++,j+=3){
      const p=vertices[i],x=pos[j],y=pos[j+1],z=pos[j+2];
      p.x=e[0]*x+e[4]*y+e[8]*z+e[12];p.y=e[1]*x+e[5]*y+e[9]*z+e[13];p.z=-(e[2]*x+e[6]*y+e[10]*z+e[14]);
    }
    const m=mesh.material,mat=this.getMaterial(m);
    for(const f of model.faces){
      const a=vertices[f.ia],b=vertices[f.ib],c=vertices[f.ic];
      if(Math.max(a.z,b.z,c.z)<.045)continue;
      const n=this.normal.set(f.nx,f.ny,f.nz).applyMatrix3(this.normals).normalize();
      const illumination=m.isMeshBasicMaterial?1: .72+.30*Math.max(0,n.dot(sunlight))+.11*Math.max(0,n.y);
      const er=m.emissive&& !m.emissiveMap ? Math.max(m.emissive.r,m.emissive.g,m.emissive.b):0;
      const r=mat.r*f.r*illumination+er*105,g=mat.g*f.g*illumination+er*65,blue=mat.b*f.b*illumination+er*45;
      if(Math.min(a.z,b.z,c.z)>=.045){this.triangle(a,b,c,r,g,blue,m,mat.texture);continue;}
      const poly=clipNear([a,b,c]);
      for(let j=1;j<poly.length-1;j++)this.triangle(poly[0],poly[j],poly[j+1],r,g,blue,m,mat.texture);
    }
  }
  triangle(a,b,c,red,green,blue,m,tex){
    const za=1/a.z,zb=1/b.z,zc=1/c.z;
    const ax=this.cx+a.x*za*this.fx,ay=this.cy-a.y*za*this.fy;
    const bx=this.cx+b.x*zb*this.fx,by=this.cy-b.y*zb*this.fy;
    const cx=this.cx+c.x*zc*this.fx,cy=this.cy-c.y*zc*this.fy;
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.abs(area)<.035 || (m.side!==T.DoubleSide && area>=0))return;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(this.w-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(this.h-1,Math.floor(Math.max(ay,by,cy)-.5));
    if(x0>x1 || y0>y1)return;
    const inv=1/area,ix=(by-cy)*inv,iy=(cx-bx)*inv,jx=(cy-ay)*inv,jy=(ax-cx)*inv;
    const fog=m.fog===false?0:Math.min(.75,(a.z+b.z+c.z)*.0024);
    const fogR=115*fog,fogG=139*fog,fogB=151*fog;
    const opacity=m.opacity??1;
    const solidR=Math.min(255,red*(1-fog)+fogR),solidG=Math.min(255,green*(1-fog)+fogG),solidB=Math.min(255,blue*(1-fog)+fogB);
    const solidColor=(255<<24)|(solidB<<16)|(solidG<<8)|solidR;
    const texR=red/255*(1-fog),texG=green/255*(1-fog),texB=blue/255*(1-fog);
    let ai=ix*(x0+.5-cx)+iy*(y0+.5-cy),bi=jx*(x0+.5-cx)+jy*(y0+.5-cy);
    const au=a.u*za,bu=b.u*zb,cu=c.u*zc,av=a.v*za,bv=b.v*zb,cv=c.v*zc;
    for(let y=y0;y<=y1;y++,ai+=iy,bi+=jy){
      let wa=ai,wb=bi,p=y*this.w+x0;
      for(let x=x0;x<=x1;x++,wa+=ix,wb+=jx,p++){
        const wc=1-wa-wb;if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
        const z=wa*za+wb*zb+wc*zc;if(z<=this.depth[p])continue;
        if(!tex&&!m.transparent){this.depth[p]=z;this.pixels[p]=solidColor;continue;}
        let r=solidR,g=solidG,b=solidB,alpha=opacity;
        if(tex){
          let u=(wa*au+wb*bu+wc*cu)/z*tex.sx,v=(wa*av+wb*bv+wc*cv)/z*tex.sy;
          u=tex.repeatX?u-Math.floor(u):Math.max(0,Math.min(.999999,u));v=tex.repeatY?v-Math.floor(v):Math.max(.000001,Math.min(1,v));
          const idx=4*(Math.min(tex.h-1,(1-v)*tex.h|0)*tex.w+Math.min(tex.w-1,u*tex.w|0)),px=tex.pixels;
          r=px[idx]*texR+fogR;g=px[idx+1]*texG+fogG;b=px[idx+2]*texB+fogB;alpha*=px[idx+3]/255;
        }
        if(alpha<=.003)continue;
        if(alpha<.995){const old=this.pixels[p],base=m.blending===T.AdditiveBlending?1:1-alpha;r=r*alpha+(old&255)*base;g=g*alpha+((old>>8)&255)*base;b=b*alpha+((old>>16)&255)*base;}
        this.pixels[p]=(255<<24)|(Math.min(255,b)<<16)|(Math.min(255,g)<<8)|Math.min(255,r);
        if(m.depthWrite)this.depth[p]=z;
      }
    }
  }
  points(mesh,camera){
    this.modelView.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);const e=this.modelView.elements;
    const xyz=mesh.geometry.attributes.position,colors=mesh.geometry.attributes.color;
    for(let i=0;i<xyz.count;i++){
      const x=xyz.getX(i),y=xyz.getY(i),z=xyz.getZ(i);if(y < -900)continue;
      const d=-(e[2]*x+e[6]*y+e[10]*z+e[14]);if(d<.05)continue;
      const sx=this.cx+(e[0]*x+e[4]*y+e[8]*z+e[12])*this.fx/d,sy=this.cy-(e[1]*x+e[5]*y+e[9]*z+e[13])*this.fy/d,r=Math.max(1,Math.min(5,.038*this.fy/d));
      const dot=(255<<24)|(linearToSrgb(colors.getZ(i))<<16)|(linearToSrgb(colors.getY(i))<<8)|linearToSrgb(colors.getX(i));
      for(let yy=Math.max(0,sy-r|0);yy<Math.min(this.h,sy+r);yy++)for(let xx=Math.max(0,sx-r|0);xx<Math.min(this.w,sx+r);xx++){const p=yy*this.w+xx;if(1/d>this.depth[p])this.pixels[p]=dot;}
    }
  }
  render(scene,camera){
    const now=performance.now();if(now<this.nextFrame)return;this.nextFrame=now+1000/32;
    camera.updateMatrixWorld();scene.updateMatrixWorld();this.vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.vp);
    const e=camera.projectionMatrix.elements;
    this.fx=e[0]*this.w/2;this.fy=e[5]*this.h/2;this.cx=(1-e[8])*this.w/2;this.cy=(1+e[9])*this.h/2;
    this.depth.fill(0);
    for(let y=0;y<this.h;y++){const h=Math.min(1,Math.max(0,(this.cy-y)/this.fy+Math.sin(camera.rotation.x)));const k=Math.sqrt(h);
      const r=169-103*k,g=186-102*k,b=194-86*k;this.pixels.fill((255<<24)|(b<<16)|(g<<8)|r,y*this.w,(y+1)*this.w);}
    const transparent=[],particles=[];
    const draw=mesh=>{
      if(mesh.isInstancedMesh){
        for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,this.instance);this.worldMatrix.multiplyMatrices(mesh.matrixWorld,this.instance);this.drawMesh(mesh,this.worldMatrix,camera);}
      }else this.drawMesh(mesh,mesh.matrixWorld,camera);
    };
    scene.traverseVisible(mesh=>{if(mesh.isPoints){particles.push(mesh);return;}
      if(!mesh.isMesh || mesh.material.isShaderMaterial)return;
      if(mesh.material.transparent)transparent.push(mesh);else draw(mesh);
    });
    transparent.forEach(draw);particles.forEach(p=>this.points(p,camera));this.ctx.putImageData(this.frame,0,0);
  }
}
