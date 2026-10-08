export function initMac(){
  const canvas=document.getElementById('macCanvas');
  const skel=document.getElementById('macSkeleton');
  const hideSkel=()=>{ if(skel)skel.classList.add('hide'); };
  const fail=()=>{const f=document.getElementById('macFallback');if(f)f.style.display='flex';if(canvas)canvas.style.display='none';hideSkel();};
  if(!canvas||typeof THREE==='undefined'){fail();return;}
  if(window.innerWidth<=880){fail();return;} // mobile: sin laptop 3D
  const stage=canvas.parentElement;
  let renderer;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});}catch(e){fail();return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(32,1,0.1,100);
  camera.position.set(0,2.6,10.8);camera.lookAt(0,1.05,0);
  scene.add(new THREE.AmbientLight(0xffffff,0.7));
  const key=new THREE.DirectionalLight(0xffffff,1.6);key.position.set(5,9,7);scene.add(key);
  const rim=new THREE.DirectionalLight(0xFDE9B8,0.7);rim.position.set(-7,4,-5);scene.add(rim);
  const glow=new THREE.PointLight(0xFBBF24,0.45,30);glow.position.set(0,2,-5);scene.add(glow);
  const laptop=new THREE.Group();scene.add(laptop);
  const alu=new THREE.MeshStandardMaterial({color:0xc4c4c9,metalness:0.92,roughness:0.34});
  function rrect(w,h,r){const s=new THREE.Shape();const x=-w/2,y=-h/2;
    s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function slab(w,h,depth,mat){const g=new THREE.ExtrudeGeometry(rrect(w,h,0.14),{depth,bevelEnabled:true,bevelThickness:0.04,bevelSize:0.04,bevelSegments:2,steps:1});g.center();return new THREE.Mesh(g,mat);}
  const base=slab(5,3.4,0.22,alu);base.rotation.x=-Math.PI/2;base.position.y=-0.11;laptop.add(base);
  const kb=new THREE.Mesh(new THREE.PlaneGeometry(4.3,2.5),new THREE.MeshStandardMaterial({color:0x1d1d20,metalness:0.4,roughness:0.7}));
  kb.rotation.x=-Math.PI/2;kb.position.set(0,0.01,0.15);laptop.add(kb);
  const pad=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.1),new THREE.MeshStandardMaterial({color:0x242428,metalness:0.4,roughness:0.6}));
  pad.rotation.x=-Math.PI/2;pad.position.set(0,0.012,1.05);laptop.add(pad);
  const pivot=new THREE.Group();pivot.position.set(0,0,-1.7);laptop.add(pivot);
  const lid=slab(5,3.4,0.16,alu);lid.position.y=1.7;pivot.add(lid);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(4.5,2.9),new THREE.MeshStandardMaterial({color:0x07080a,metalness:0.1,roughness:0.4,emissive:0x0c1018,emissiveIntensity:1}));
  face.position.set(0,1.7,0.09);pivot.add(face);
  const dock=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.16),new THREE.MeshStandardMaterial({color:0xFBBF24,emissive:0xFBBF24,emissiveIntensity:0.5,transparent:true,opacity:0.35}));
  dock.position.set(0,0.55,0.095);pivot.add(dock);
  const bar=new THREE.Mesh(new THREE.PlaneGeometry(3.4,0.12),new THREE.MeshStandardMaterial({color:0x3a3a42,emissive:0x222228,emissiveIntensity:0.4}));
  bar.position.set(0,2.5,0.095);pivot.add(bar);
  const mark=new THREE.Mesh(new THREE.CircleGeometry(0.34,32),new THREE.MeshStandardMaterial({color:0xFBBF24,emissive:0xFBBF24,emissiveIntensity:1.1}));
  mark.position.set(0,1.7,-0.09);mark.rotation.y=Math.PI;pivot.add(mark);
  pivot.rotation.x=-0.18;laptop.position.y=-0.1;
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(2.7,48),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.3}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-0.35;scene.add(shadow);
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);
  let baseRot=-0.35, lapVisible=true;
  if('IntersectionObserver' in window){
    new IntersectionObserver(es=>{lapVisible=es[0].isIntersecting;},{threshold:0.01}).observe(stage);
  }
  let firstFrame=true;
  function render(){requestAnimationFrame(render);
    if(!lapVisible)return; // no renderizar el 3D si no está en pantalla
    const t=performance.now()*0.001;
    laptop.rotation.y=baseRot+scrollY*0.0016;
    laptop.rotation.x=0.10+Math.sin(t*0.6)*0.035;
    laptop.position.y=0.45+Math.sin(t*0.9)*0.06;
    mark.material.emissiveIntensity=1.0+Math.sin(t*1.6)*0.35;
    renderer.render(scene,camera);
    if(firstFrame){firstFrame=false;hideSkel();} // oculta el skeleton al primer frame
  }
  render();
}
