// Render all 33 nozzle starts in one volume, blending to a common downstream
// envelope. This is a visual approximation, not interacting-jet CFD.
export function clusterPlumeSource(source) {
    const before='        float z=max(0.0,axial);\n        vec2 xy=p.xy*metric.xy;float r=length(xy);';
    const after=`        float physicalZ=max(0.0,axial);
        float individual=1.0-smoothstep(.20,1.50,physicalZ);
        vec2 worldXY=p.xy*metric.xy;
        vec2 offset=closestEngine(worldXY);
        float engineScale=.17407765596;
        vec2 xy=mix(worldXY,(worldXY-offset)/engineScale,individual);
        float z=mix(physicalZ,physicalZ/engineScale,individual);
        float r=length(xy);
        float nozzleAxial=axial/engineScale;`;
    if(!source.includes(before))throw new Error('Expected exhaust sample coordinates are missing.');
    return `
vec2 ringEngine(vec2 p,float radius,float count,float phase) {
    float stepAngle=6.28318530718/count;
    float angle=phase+stepAngle*floor((atan(p.y,p.x)-phase)/stepAngle+.5);
    return radius*vec2(cos(angle),sin(angle));
}
vec2 closestEngine(vec2 p) {
    vec2 a=ringEngine(p,.14,3.0,-1.57079632679);
    vec2 b=ringEngine(p,.43,10.0,.314159265359);
    vec2 c=ringEngine(p,.85,20.0,0.0);
    vec2 deltaA=p-a,deltaB=p-b,deltaC=p-c;
    vec2 best=dot(deltaA,deltaA)<dot(deltaB,deltaB)?a:b;
    vec2 delta=p-best;
    return dot(delta,delta)<dot(deltaC,deltaC)?best:c;
}
`+source.replace(before,after)
        .replace('float bore=re+.49*min(axial,0.0);','float bore=re+.49*min(nozzleAxial,0.0);')
        .replace('smoothstep(-.44,-.30,axial)','smoothstep(-.44,-.30,nozzleAxial)');
}
