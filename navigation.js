export function makeNavigation(bounds, obstacles) {
  const width = bounds.x * 2 + 1, rows = bounds.z * 2 + 1, count = width * rows;
  const clearance = .42;
  function open(x,z,r=clearance) {
    if(Math.abs(x)>bounds.x-r || Math.abs(z)>bounds.z-r)return false;
    return !obstacles.some(b=>x>b.min.x-r && x<b.max.x+r && z>b.min.z-r && z<b.max.z+r);
  }
  const index=(x,z)=>(Math.round(z)+bounds.z)*width+Math.round(x)+bounds.x;
  const free = new Uint8Array(count), distance = new Int16Array(count), queue = new Int32Array(count);
  const xAt=i=>i%width-bounds.x,zAt=i=>Math.floor(i/width)-bounds.z;
  for(let i=0;i<count;i++)free[i]=open(xAt(i),zAt(i),.50);
  const dirs=[-width,width,-1,1];
  let target=-1;
  function cell(x,z) {
    const at=index(x,z);
    if(free[at])return at;
    let best=-1,closest=Infinity;
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      const i=at+dx+dz*width;
      const d=(x-xAt(i))**2+(z-zAt(i))**2;
      if(free[i] && d<closest){best=i;closest=d;}
    }
    return best;
  }
  function update(x,z) {
    const goal=cell(x,z);
    if(goal===target)return;
    target=goal;distance.fill(-1);
    if(goal<0)return;
    let head=0,tail=1;queue[0]=goal;distance[goal]=0;
    while(head<tail){
      const here=queue[head++];
      for(const offset of dirs){
        const next=here+offset;
        if(free[next] && distance[next]===-1){distance[next]=distance[here]+1;queue[tail++]=next;}
      }
    }
  }
  function clearSegment(x,z,tx,tz,r=clearance) {
    const dx=tx-x,dz=tz-z;
    // Clip the horizontal segment against expanded collision boxes.
    for(const b of obstacles){
      let first=0,last=1;
      if(!dx && (x<=b.min.x-r || x>=b.max.x+r))continue;
      if(!dz && (z<=b.min.z-r || z>=b.max.z+r))continue;
      if(dx){const a=(b.min.x-r-x)/dx,c=(b.max.x+r-x)/dx;first=Math.max(first,Math.min(a,c));last=Math.min(last,Math.max(a,c));}
      if(dz){const a=(b.min.z-r-z)/dz,c=(b.max.z+r-z)/dz;first=Math.max(first,Math.min(a,c));last=Math.min(last,Math.max(a,c));}
      if(first<=last)return false;
    }
    return true;
  }
  function nextStep(x,z,tx,tz) {
    if(clearSegment(x,z,tx,tz))return [tx,tz];
    let at=cell(x,z),best=at;
    if(at<0 || distance[at]<0)return [x,z];
    for(let step=0;step<6;step++){
      const next=dirs.map(d=>at+d).filter(i=>distance[i]>=0 && distance[i]<distance[at]).sort((a,b)=>Math.hypot(tx-xAt(a),tz-zAt(a))-Math.hypot(tx-xAt(b),tz-zAt(b)))[0];
      if(next===undefined || !clearSegment(x,z,xAt(next),zAt(next),.39))break;
      best=at=next;
    }
    return [xAt(best),zAt(best)];
  }
  return {open,update,nextStep,clearSegment};
}
