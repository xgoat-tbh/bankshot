// Minimum edge-to-edge separation; dynamic entities reserve their full sweep.
export const CLEARANCE_TYPES = ['spawn', 'goal', 'portal', 'well', 'bumper', 'moving', 'hazard', 'wall'];
export const CLEARANCE = [
  [0,280,90,180,90,120,160,70], [280,0,110,220,90,140,140,80],
  [90,110,90,165,89,110,90,78], [180,220,165,260,150,160,220,120],
  [90,90,89,150,90,90,80,79], [120,140,110,160,90,110,90,85],
  [160,140,90,220,80,90,60,50], [70,80,78,120,79,85,50,40],
];
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function pointSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;
  const t=q?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function segmentDistance(a,b,c,d) {
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if (((abC>0&&abD<0)||(abC<0&&abD>0))&&((cdA>0&&cdB<0)||(cdA<0&&cdB>0))) return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function inside(p,poly) {
  if(poly.length<3)return false;
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
export function entityShape(type,value) {
  if(type==='spawn')return {points:[value],radius:14};
  if(type==='goal'||type==='hazard')return {points:value,radius:0};
  if(type==='wall')return {points:[value.a,value.b],radius:0};
  if(type==='moving') {
    const [dx,dy]=value.delta;
    const xs=[value.a[0],value.b[0]],ys=[value.a[1],value.b[1]];
    const l=Math.min(...xs)-Math.abs(dx),r=Math.max(...xs)+Math.abs(dx),t=Math.min(...ys)-Math.abs(dy),b=Math.max(...ys)+Math.abs(dy);
    return {points:[[l,t],[r,t],[r,b],[l,b]],radius:0};
  }
  const motion=value.motion;
  if(motion) {
    const ax=0,ay=motion.amplitude?.[1]??35;
    return {points:[[value.x-Math.abs(ax),value.y-Math.abs(ay)],[value.x+Math.abs(ax),value.y-Math.abs(ay)],[value.x+Math.abs(ax),value.y+Math.abs(ay)],[value.x-Math.abs(ax),value.y+Math.abs(ay)]],radius:value.radius};
  }
  return {points:[[value.x,value.y]],radius:value.radius};
}
export function edgeDistance(a,b) {
  if(inside(a.points[0],b.points)||inside(b.points[0],a.points))return -a.radius-b.radius;
  let distance=Infinity;
  for(let i=0;i<a.points.length;i++) for(let j=0;j<b.points.length;j++) {
    distance=Math.min(distance,segmentDistance(a.points[i],a.points[(i+1)%a.points.length],b.points[j],b.points[(j+1)%b.points.length]));
  }
  return distance-a.radius-b.radius;
}
export class ClearanceEngine {
  constructor(){this.entities=[];}
  conflicts(type,value) {
    const shape=entityShape(type,value),index=CLEARANCE_TYPES.indexOf(type);
    return this.entities.filter(other=>edgeDistance(shape,other.shape)+1e-7<CLEARANCE[index][CLEARANCE_TYPES.indexOf(other.type)]);
  }
  add(type,value,force=false){if(!force&&this.conflicts(type,value).length)return false;this.entities.push({type,value,shape:entityShape(type,value)});return true;}
}
export function validateClearance(room) {
  const engine=new ClearanceEngine(),errors=[];
  // Arena joins are intentional; interior walls and all playable entities are checked against them.
  for(const boundary of room.walls.slice(0,8))engine.add('wall',boundary,true);
  for(const [type,items] of [['spawn',[room.puck]],['goal',[room.goal]],['portal',(room.portals??[]).flatMap(p=>[p.A,p.B])],['well',room.gravityWells??[]],['bumper',room.bumpers??[]],['moving',room.movingWalls??[]],['hazard',room.hazards],['wall',room.walls.slice(8)]]) {
    for(const item of items){if(!engine.add(type,item))errors.push({type,item});}
  }
  return errors;
}
