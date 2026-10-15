export function initColorBends(){
  if(typeof THREE==='undefined')return;
  const container=document.getElementById('colorBends');
  if(!container)return;
  if(window.innerWidth<=880){container.style.display='none';return;} // mobile: sin shader WebGL

  const opts={
    rotation:90, speed:0.2, autoRotate:4,
    colors:['#FBBF24','#14B8A6','#F472B6','#F59E0B'],
    transparent:true, scale:1, frequency:1, warpStrength:1,
    mouseInfluence:1, parallax:0.5, noise:0.15,
    iterations:1, intensity:2.2, bandWidth:5
  };

  const MAX_COLORS=8;
  const vert=`
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`;
  const frag=`
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;
void main(){
  float t=uTime*uSpeed;
  vec2 p=vUv*2.0-1.0;
  p+=uPointer*uParallax*0.1;
  vec2 rp=vec2(p.x*uRot.x-p.y*uRot.y, p.x*uRot.y+p.y*uRot.x);
  vec2 q=vec2(rp.x*(uCanvas.x/uCanvas.y), rp.y);
  q/=max(uScale,0.0001);
  q/=0.5+0.2*dot(q,q);
  q+=0.2*cos(t)-7.56;
  vec2 toward=(uPointer-rp);
  q+=toward*uMouseInfluence*0.2;
  for(int j=0;j<5;j++){
    if(j>=uIterations-1)break;
    vec2 rr=sin(1.5*(q.yx*uFrequency)+2.0*cos(q*uFrequency));
    q+=(rr-q)*0.15;
  }
  vec3 col=vec3(0.0);
  float a=1.0;
  if(uColorCount>0){
    vec2 s=q;
    vec3 sumCol=vec3(0.0);
    float cover=0.0;
    for(int i=0;i<MAX_COLORS;++i){
      if(i>=uColorCount)break;
      s-=0.01;
      vec2 r=sin(1.5*(s.yx*uFrequency)+2.0*cos(s*uFrequency));
      float m0=length(r+sin(5.0*r.y*uFrequency-3.0*t+float(i))/4.0);
      float kBelow=clamp(uWarpStrength,0.0,1.0);
      float kMix=pow(kBelow,0.3);
      float gain=1.0+max(uWarpStrength-1.0,0.0);
      vec2 disp=(r-s)*kBelow;
      vec2 warped=s+disp*gain;
      float m1=length(warped+sin(5.0*warped.y*uFrequency-3.0*t+float(i))/4.0);
      float m=mix(m0,m1,kMix);
      float w=1.0-exp(-uBandWidth/exp(uBandWidth*m));
      sumCol+=uColors[i]*w;
      cover=max(cover,w);
    }
    col=clamp(sumCol,0.0,1.0);
    a=uTransparent>0?cover:1.0;
  }else{
    vec2 s=q;
    for(int k=0;k<3;++k){
      s-=0.01;
      vec2 r=sin(1.5*(s.yx*uFrequency)+2.0*cos(s*uFrequency));
      float m0=length(r+sin(5.0*r.y*uFrequency-3.0*t+float(k))/4.0);
      float kBelow=clamp(uWarpStrength,0.0,1.0);
      float kMix=pow(kBelow,0.3);
      float gain=1.0+max(uWarpStrength-1.0,0.0);
      vec2 disp=(r-s)*kBelow;
      vec2 warped=s+disp*gain;
      float m1=length(warped+sin(5.0*warped.y*uFrequency-3.0*t+float(k))/4.0);
      float m=mix(m0,m1,kMix);
      col[k]=1.0-exp(-uBandWidth/exp(uBandWidth*m));
    }
    a=uTransparent>0?max(max(col.r,col.g),col.b):1.0;
  }
  col*=uIntensity;
  if(uNoise>0.0001){
    float n=fract(sin(dot(gl_FragCoord.xy+vec2(uTime),vec2(12.9898,78.233)))*43758.5453123);
    col+=(n-0.5)*uNoise;
    col=clamp(col,0.0,1.0);
  }
  vec3 rgb=(uTransparent>0)?col*a:col;
  gl_FragColor=vec4(rgb,a);
}`;

  function toVec3(hex){
    const h=hex.replace('#','').trim();
    const v=h.length===3
      ?[parseInt(h[0]+h[0],16),parseInt(h[1]+h[1],16),parseInt(h[2]+h[2],16)]
      :[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
    return new THREE.Vector3(v[0]/255,v[1]/255,v[2]/255);
  }

  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geometry=new THREE.PlaneGeometry(2,2);
  const uColorsArray=Array.from({length:MAX_COLORS},()=>new THREE.Vector3(0,0,0));
  const colorVecs=opts.colors.filter(Boolean).slice(0,MAX_COLORS).map(toVec3);
  for(let i=0;i<MAX_COLORS;i++){ if(i<colorVecs.length)uColorsArray[i].copy(colorVecs[i]); }

  const material=new THREE.ShaderMaterial({
    vertexShader:vert,
    fragmentShader:frag,
    uniforms:{
      uCanvas:{value:new THREE.Vector2(1,1)},
      uTime:{value:0},
      uSpeed:{value:opts.speed},
      uRot:{value:new THREE.Vector2(1,0)},
      uColorCount:{value:colorVecs.length},
      uColors:{value:uColorsArray},
      uTransparent:{value:opts.transparent?1:0},
      uScale:{value:opts.scale},
      uFrequency:{value:opts.frequency},
      uWarpStrength:{value:opts.warpStrength},
      uPointer:{value:new THREE.Vector2(0,0)},
      uMouseInfluence:{value:opts.mouseInfluence},
      uParallax:{value:opts.parallax},
      uNoise:{value:opts.noise},
      uIterations:{value:opts.iterations},
      uIntensity:{value:opts.intensity},
      uBandWidth:{value:opts.bandWidth}
    },
    premultipliedAlpha:true,
    transparent:true
  });
  scene.add(new THREE.Mesh(geometry,material));

  let renderer;
  try{
    renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',alpha:true});
  }catch(e){ container.style.display='none'; return; }
  if('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace=THREE.SRGBColorSpace;
  else if('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.setPixelRatio(0.6);
  renderer.setClearColor(0x000000,opts.transparent?0:1);
  renderer.domElement.style.width='100%';
  renderer.domElement.style.height='100%';
  renderer.domElement.style.display='block';
  container.appendChild(renderer.domElement);

  const clock=new THREE.Clock();
  function resize(){
    const w=container.clientWidth||window.innerWidth||1;
    const h=container.clientHeight||window.innerHeight||1;
    renderer.setSize(w,h,false);
    material.uniforms.uCanvas.value.set(w,h);
  }
  resize();
  if('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
  else window.addEventListener('resize',resize);

  const pointerTarget=new THREE.Vector2(0,0);
  const pointerCurrent=new THREE.Vector2(0,0);
  const pointerSmooth=8;
  window.addEventListener('pointermove',function(e){
    const x=(e.clientX/(window.innerWidth||1))*2-1;
    const y=-((e.clientY/(window.innerHeight||1))*2-1);
    pointerTarget.set(x,y);
  });

  let raf, lastT=0;
  const FRAME_MS=1000/30;
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let firstFrame=true;
  function loop(now){
    raf=requestAnimationFrame(loop);
    if(now-lastT<FRAME_MS) return;
    lastT=now;
    const dt=clock.getDelta();
    const elapsed=clock.elapsedTime;
    material.uniforms.uTime.value=elapsed;
    const deg=(opts.rotation%360)+(reduce?0:opts.autoRotate*elapsed);
    const rad=deg*Math.PI/180;
    material.uniforms.uRot.value.set(Math.cos(rad),Math.sin(rad));
    pointerCurrent.lerp(pointerTarget,Math.min(1,dt*pointerSmooth));
    material.uniforms.uPointer.value.copy(pointerCurrent);
    renderer.render(scene,camera);
    if(firstFrame){
      firstFrame=false;
      container.dataset.ready='1';
      // opacidad inicial según la slide activa (0.9 portadas .cover, 0.2 resto)
      container.style.opacity = slides[currentSlideIndex].classList.contains('cover') ? '0.9' : '0.2';
    }
  }
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){ if(raf){cancelAnimationFrame(raf);raf=null;} }
    else if(!raf){ clock.getDelta(); raf=requestAnimationFrame(loop); }
  });
  raf=requestAnimationFrame(loop);
}