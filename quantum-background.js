(function(){
    const c=document.getElementById('q-aurora');
    if(!c)return;
    const ctx=c.getContext('2d');
    let W,H,blobs,raf;
    function resize(){W=c.width=innerWidth;H=c.height=innerHeight;}
    function init(){
        blobs=[
            {x:W*.7,y:H*.25,r:W*.38,dr:244,dg:114,db:182,a:0.05,t:0},
            {x:W*.2,y:H*.65,r:W*.32,dr:249,dg:168,db:212,a:0.035,t:3},
            {x:W*.85,y:H*.7,r:W*.28,dr:251,dg:191,db:36,a:0.03,t:1.5},
        ];
    }
    function draw(){
        ctx.clearRect(0,0,W,H);
        blobs.forEach(b=>{
            b.t+=0.004; b.x+=Math.sin(b.t*.9)*.5; b.y+=Math.cos(b.t*.7)*.4;
            b.x=((b.x%W)+W)%W; b.y=((b.y%H)+H)%H;
            const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
            g.addColorStop(0,`rgba(${b.dr},${b.dg},${b.db},${b.a})`);
            g.addColorStop(1,'rgba(0,0,0,0)');
            ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
            ctx.fillStyle=g;ctx.fill();
        });
        raf=requestAnimationFrame(draw);
    }
    resize();init();draw();
    window.addEventListener('resize',()=>{cancelAnimationFrame(raf);resize();init();draw();});
})();
