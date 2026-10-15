(function() {
    const c = document.getElementById('ms-aurora');
    if (!c) return;
    const ctx = c.getContext('2d');
    let W, H, blobs, raf;
    function resize() { W=c.width=innerWidth; H=c.height=innerHeight; }
    function init() {
        blobs = [
            {x:W*.15,y:H*.3,r:W*.4,dr:20,dg:184,db:166,a:0.05,t:0},
            {x:W*.8,y:H*.2,r:W*.35,dr:45,dg:212,db:191,a:0.035,t:2},
            {x:W*.6,y:H*.75,r:W*.38,dr:251,dg:191,db:36,a:0.03,t:4},
        ];
    }
    function draw() {
        ctx.clearRect(0,0,W,H);
        blobs.forEach(b => {
            b.t+=0.005; b.x+=Math.sin(b.t*.8)*.5; b.y+=Math.cos(b.t*.6)*.4;
            b.x=((b.x%W)+W)%W; b.y=((b.y%H)+H)%H;
            const g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
            g.addColorStop(0,`rgba(${b.dr},${b.dg},${b.db},${b.a})`);
            g.addColorStop(1,'rgba(0,0,0,0)');
            ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
            ctx.fillStyle=g; ctx.fill();
        });
        raf=requestAnimationFrame(draw);
    }
    resize(); init(); draw();
    window.addEventListener('resize',()=>{cancelAnimationFrame(raf);resize();init();draw();});
})();
