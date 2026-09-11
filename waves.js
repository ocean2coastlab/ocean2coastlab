/* =====================================================================
   연안파랑연구실 — Hero 배경 불규칙파 (Canvas 2D, 외부 의존성 없음)
   ---------------------------------------------------------------------
   JONSWAP 파수 스펙트럼에서 성분 28개를 뽑아 무작위 위상으로 중첩하고,
   Gerstner 변위로 마루를 뾰족하게, 골을 넓게 만든 불규칙파 수면을
   원근 격자에 투영해 그립니다.

     · 분산관계      ω = 0.24·√k  (심해파)
     · 방향 분산     첨두 ±0.2 rad → 고주파 ±1.2 rad
     · 파형경사 합   Σ Q·A·k = 0.78 (1 미만이라 파형이 겹치지 않음)
     · LOD          격자 간격보다 짧은 파는 행별로 자동 제외 (나이퀴스트)
     · 백파          마루의 수평 압축(야코비안)이 큰 지점만 밝게

   조정: index.html 의 <canvas data-amp / data-speed / data-bright /
         data-spread / data-horizon> 속성으로 바꿀 수 있습니다.
   ===================================================================== */
(function(){
'use strict';

var cv = document.getElementById('hero-waves');
if (!cv) return;
var ctx = cv.getContext('2d', { alpha:false });

/* 값 조정은 캔버스의 data-* 속성으로도 가능
   <canvas id="hero-waves" data-amp="1.0" data-speed="1.0" data-bright="1.0"
           data-spread="1.0" data-wave="1.0" data-horizon="0.115"
           data-quality="1"></canvas>
   data-quality 는 시작 격자 밀도(0=최상 … 4=최소). 생략하면 기기 성능으로
   자동 선택하며, 어느 쪽이든 프레임이 밀리면 스스로 한 단계씩 낮춥니다.   */
function attr(name, def){
  var v = parseFloat(cv.getAttribute('data-'+name));
  return isNaN(v) ? def : v;
}

/* ---------------- 사인 LUT ---------------- */
var TAU = Math.PI*2, LN = 8192, LMASK = LN-1, LQ = LN>>2, LSC = LN/TAU;
var LUT = new Float32Array(LN);
for (var li=0; li<LN; li++) LUT[li] = Math.sin(li/LN*TAU);
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function smoothstep(e0,e1,x){ var t = clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); }
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a>>>15, 1|a);
    t = t + Math.imul(t ^ t>>>7, 61|t) ^ t;
    return ((t ^ t>>>14) >>> 0) / 4294967296;
  };
}

/* ================================================================
   불규칙파(random sea) — JONSWAP 파수 스펙트럼 + 방향 분산 + 무작위 위상
   ================================================================ */
var NFULL = 16;                 // 전체 성분 수
var LPEAK = 10;               // 첨두 파장
var LMAXW = 1.55, LMINW = 0.055;
var SIGMA = 0.105;              // 수면 표준편차 (Hs = 4σ)
var CDISP = 0.24;               // 분산관계 계수 : ω = CDISP·√k
var GAMMA = 5;                // JONSWAP 첨두 증폭
var STEEP = 0.78;               // Σ Q·A·k (1 미만이어야 파형이 겹치지 않음)
var SEED  = 20260902;
var WAVES = [], AMP_SIG = SIGMA;
var uSpread = 0.5;   // 방향 분산 배율 (data-spread)
var uWave   = 1.0;   // 파장 배율 (data-wave)

function buildSpectrum(){
  var rnd = mulberry32(SEED);
  var kp = TAU/(LPEAK*uWave), lnR = Math.log(LMAXW/LMINW);
  var i, arr = [], sum2 = 0;
  for (i=0;i<NFULL;i++){
    var t = (i+0.5)/NFULL;
    var L = LMAXW*uWave*Math.exp(-lnR*t);          // 파장: 긴 것 → 짧은 것
    var k = TAU/L;
    var dk = k*lnR/NFULL;                    // 등비 분할의 파수 폭
    var xr = k/kp;

    // Pierson–Moskowitz 형태 + JONSWAP 첨두 강화
    var S  = Math.pow(xr,-3)*Math.exp(-1.25/(xr*xr));
    var sg = xr <= 1 ? 0.07 : 0.09;
    S *= Math.pow(GAMMA, Math.exp(-(xr-1)*(xr-1)/(2*sg*sg)));

    var A = Math.sqrt(2*S*dk);

    // 방향 분산: 첨두 부근은 좁고, 고주파일수록 넓게 퍼짐
    var spread = (0.20 + 1.05*smoothstep(0.9, 4.5, xr))*uSpread;
    var th = 0.10 + spread*(rnd()*2-1);

    arr.push({ L:L, k:k, dir:th, ph:rnd()*TAU, A:A });
    sum2 += A*A;
  }
  // σ 정규화
  var sc = SIGMA/Math.sqrt(sum2/2);
  var akSum = 0;
  for (i=0;i<NFULL;i++){ arr[i].A *= sc; akSum += arr[i].A*arr[i].k; }
  // Gerstner 계수: 전체 파형경사 합이 STEEP 이 되도록
  var q = STEEP/akSum;
  for (i=0;i<NFULL;i++){
    var w = arr[i];
    w.kx = Math.sin(w.dir);
    w.kz = Math.cos(w.dir);
    w.om = CDISP*Math.sqrt(w.k);
    w.Q  = q;
  }
  WAVES = arr;
}
uSpread = attr('spread',1);
uWave   = attr('wave',1);
buildSpectrum();

/* ---------------- 밝기 6단계 팔레트 ---------------- */
var STROKE = [
  ['rgba(14,48,150,0.22)', 0.60],
  ['rgba(18,86,225,0.30)', 0.72],
  ['rgba(26,124,255,0.40)', 0.84],
  ['rgba(58,186,248,0.52)', 0.96],
  ['rgba(96,214,238,0.60)', 1.04],
  ['rgba(140,242,232,0.80)', 1.16]
];
var DOT = [
  ['rgba(30,80,190,0.34)', 0],
  ['rgba(46,126,238,0.50)', 0],
  ['rgba(74,172,255,0.68)', 0],
  ['rgba(140,216,255,0.84)', 0],
  ['rgba(126,232,242,0.95)', 0],
  ['rgba(160,250,236,1.00)', 0]
];

var TIERS = [
  { cols:150, rows:110, ncomp:28, diag:true,  dots:true,  dpr:1.50 },
  { cols:124, rows: 92, ncomp:24, diag:true,  dots:true,  dpr:1.40 },
  { cols:100, rows: 76, ncomp:18, diag:true,  dots:true,  dpr:1.25 },
  { cols: 80, rows: 60, ncomp:14, diag:false, dots:true,  dpr:1.00 },
  { cols: 62, rows: 48, ncomp:10, diag:false, dots:false, dpr:1.00 }
];

/* ---------------- 상태 ---------------- */
var W=0,H=0,DPR=1,COLS=0,ROWS=0,TIER=1,AUTO=true,NUSE=24;
var focal=0, meshTopY=0, hzY=0, zNear=0, zFar=0, aFan=0, bFan=0;
var Z,HALFW,DEPTHF,AMPF,LODF,ACT,ACTN,ROWDOT,COLSTEP,DOTSZ,WX,SX,SY,BV;
var PHA,DPH,AEF,QAX,QAZ,QAK;
var stars=null;
var uAmp=attr('amp',1), uSpd=attr('speed',1), uBri=attr('bright',1), uHz=attr('horizon',0.115);
var segCount=0, PERSP=5.0;

function pickStartTier(){
  var w = window.innerWidth, dpr = window.devicePixelRatio||1;
  var cores = navigator.hardwareConcurrency || 4;
  if (w < 700) return 3;
  if (w < 1180) return 2;
  if (cores <= 4 || dpr > 2.2) return 2;
  return 1;
}

/* ---------------- 별하늘 ---------------- */
function buildStars(){
  var skyH = Math.max(24, meshTopY + 10);
  var sc = document.createElement('canvas');
  sc.width  = Math.max(1, Math.round(W*DPR));
  sc.height = Math.max(1, Math.round(skyH*DPR));
  var g = sc.getContext('2d');
  g.setTransform(DPR,0,0,DPR,0,0);
  var i;
  for (i=0;i<5;i++){
    var cx = W*(0.12+0.19*i), cyy = skyH*(0.15+0.17*(i%3)), rr = skyH*(1.0+0.6*(i%2));
    var rg = g.createRadialGradient(cx,cyy,0,cx,cyy,rr);
    rg.addColorStop(0,'rgba(126,152,205,0.055)');
    rg.addColorStop(1,'rgba(126,152,205,0)');
    g.fillStyle = rg; g.fillRect(cx-rr,cyy-rr,rr*2,rr*2);
  }
  var n = clamp(Math.round(W*skyH/850), 140, 1200);
  for (i=0;i<n;i++){
    var x = Math.random()*W;
    var y = Math.pow(Math.random(),0.7)*skyH;
    var br = Math.pow(Math.random(),2.2);
    var s = 0.55 + br*1.5, a = 0.16 + br*0.82;
    g.fillStyle = 'rgba('+(214+Math.round(br*41))+','+(228+Math.round(br*27))+',255,'+a.toFixed(3)+')';
    g.fillRect(x,y,s,s);
    if (br > 0.87){
      var gr = g.createRadialGradient(x,y,0,x,y,s*3.6);
      gr.addColorStop(0,'rgba(198,224,255,0.22)');
      gr.addColorStop(1,'rgba(198,224,255,0)');
      g.fillStyle = gr; g.fillRect(x-s*3.6,y-s*3.6,s*7.2,s*7.2);
    }
  }
  stars = sc;
}

/* ---------------- 지오메트리 ---------------- */
function build(){
  var t = TIERS[TIER];
  COLS = t.cols; ROWS = t.rows; NUSE = Math.min(t.ncomp, NFULL);
  DPR = Math.min(window.devicePixelRatio||1, t.dpr);

  W = cv.clientWidth  || window.innerWidth;
  H = cv.clientHeight || window.innerHeight;
  cv.width  = Math.round(W*DPR);
  cv.height = Math.round(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);

  focal    = W*0.85;
  meshTopY = Math.round(H*uHz);
  hzY  = (PERSP*meshTopY - H)/(PERSP - 1);     // 소실점(화면 위쪽 밖)
  var dyNear = H - hzY, dyFar = meshTopY - hzY;
  zNear = focal/dyNear;
  zFar  = focal/dyFar;

  aFan = (W*0.53)/focal;
  bFan = zNear*(W*0.24)/focal;

  Z=new Float32Array(ROWS); HALFW=new Float32Array(ROWS);
  DEPTHF=new Float32Array(ROWS); AMPF=new Float32Array(ROWS);
  LODF=new Float32Array(ROWS*NUSE); ACT=new Int32Array(ROWS*NUSE); ACTN=new Int32Array(ROWS);
  ROWDOT=new Uint8Array(ROWS); COLSTEP=new Uint8Array(ROWS); DOTSZ=new Float32Array(ROWS);
  WX=new Float32Array(ROWS*COLS); SX=new Float32Array(ROWS*COLS);
  SY=new Float32Array(ROWS*COLS); BV=new Uint8Array(ROWS*COLS);
  PHA=new Float64Array(NUSE); DPH=new Float64Array(NUSE);
  AEF=new Float32Array(NUSE); QAX=new Float32Array(NUSE);
  QAZ=new Float32Array(NUSE); QAK=new Float32Array(NUSE);

  var j,i,n, prevDy = 0;
  for (j=0;j<ROWS;j++){
    var tt = ROWS>1 ? j/(ROWS-1) : 0;
    var dy = dyFar + (dyNear-dyFar)*Math.pow(1-tt, 2.0);
    var z  = focal/dy;
    Z[j] = z;

    var dz = (j>0) ? Math.abs(z - Z[j-1]) : Math.abs(focal/(dy+8) - z);
    dz = dz || 1e-4;
    var halfW = aFan*z + bFan;
    HALFW[j] = halfW;
    var dx = 2*halfW/(COLS-1);
    var ds = dz>dx ? dz : dx;

    // 격자로 표현 가능한 성분만 남긴다 (나이퀴스트 LOD)
    var cnt = 0;
    for (n=0;n<NUSE;n++){
      var lf = smoothstep(1.7, 3.4, WAVES[n].L/ds);
      LODF[j*NUSE+n] = lf;
      if (lf > 0.004){ ACT[j*NUSE+cnt] = n; cnt++; }
    }
    ACTN[j] = cnt;

    AMPF[j]   = 1 - 0.72*smoothstep(0.60, 1.0, tt);
    DEPTHF[j] = (0.56 + 0.44*smoothstep(0,0.26,tt)) * (1 - 0.58*smoothstep(0.78,1.0,tt));

    var gap = (j>0) ? Math.abs(prevDy - dy) : (dyNear*0.05);
    prevDy = dy;
    ROWDOT[j] = (t.dots && gap > 2.0) ? 1 : 0;
    DOTSZ[j]  = clamp(0.70 + gap*0.055, 0.8, 2.6);
    var sxGap = focal*(aFan + bFan/z)*2/(COLS-1);
    COLSTEP[j] = sxGap < 4.5 ? 2 : 1;

    var base = j*COLS;
    for (i=0;i<COLS;i++){
      var u = ((COLS>1 ? i/(COLS-1) : 0.5)*2 - 1);
      WX[base+i] = u*halfW;
      SX[base+i] = W*0.5 + focal*u*(aFan + bFan/z);
    }
  }
  segCount = ROWS*(COLS-1) + COLS*(ROWS-1) + (t.diag ? (ROWS-1)*(COLS-1) : 0);
  buildStars();
}

/* ---------------- 렌더 ---------------- */
var PR = [], PC = [], PD = [], D = [];
function render(T){
  var j,i,m,n,idx,idx2,base,z,df,hn,crest,v,b,b2;

  for (j=0;j<ROWS;j++){
    z = Z[j]; df = DEPTHF[j]; base = j*COLS;
    var af = AMPF[j]*uAmp; if (af < 0.02) af = 0.02;
    var halfW = HALFW[j], dx0 = 2*halfW/(COLS-1);
    var an = ACTN[j], abase = j*NUSE, jsum = 0;

    // 행마다 성분별 위상·증분을 미리 계산 (열 방향으로는 덧셈만)
    for (m=0;m<an;m++){
      n = ACT[abase+m];
      var wv = WAVES[n];
      PHA[m] = (wv.k*(-halfW*wv.kx + z*wv.kz) + wv.om*T + wv.ph) % TAU;
      DPH[m] = wv.k*wv.kx*dx0;
      var A  = wv.A*LODF[abase+n]*af;
      AEF[m] = A;
      var QA = wv.Q*A;
      QAX[m] = QA*wv.kx; QAZ[m] = QA*wv.kz;
      QAK[m] = QA*wv.k;  jsum += QAK[m];
    }
    var invJ  = jsum > 1e-6 ? 1/jsum : 0;
    var invHn = 1/(2.6*SIGMA*af);

    for (i=0;i<COLS;i++){
      idx = base+i;
      var y=0, dxw=0, dzw=0, jac=0;
      for (m=0;m<an;m++){
        var pi = (PHA[m]*LSC)|0;
        var sp = LUT[pi & LMASK], cp = LUT[(pi+LQ) & LMASK];
        y   += AEF[m]*sp;
        dxw += QAX[m]*cp;
        dzw += QAZ[m]*cp;
        jac += QAK[m]*sp;
        PHA[m] += DPH[m];
      }

      var zp = z + dzw; if (zp < 0.06) zp = 0.06;
      var ivz = 1/zp;
      SX[idx] = W*0.5 + focal*(WX[idx] + dxw)*ivz;
      SY[idx] = hzY + focal*(1 - y)*ivz;

      hn = y*invHn;
      crest = smoothstep(-0.95, 1.0, hn);
      var foam = smoothstep(0.34, 0.78, jac*invJ);
      v = df*(0.28 + 0.72*crest + 0.46*foam)*uBri;
      BV[idx] = v<=0 ? 0 : (v>=1 ? 5 : (v*6)|0);
    }
  }

  /* 배경 */
  ctx.globalCompositeOperation = 'source-over';
  var gsky = ctx.createLinearGradient(0,0,0,meshTopY);
  gsky.addColorStop(0,'#01030a'); gsky.addColorStop(0.7,'#03081a'); gsky.addColorStop(1,'#07182e');
  ctx.fillStyle = gsky; ctx.fillRect(0,0,W,meshTopY);
  var gwat = ctx.createLinearGradient(0,meshTopY,0,H);
  gwat.addColorStop(0,'#0a2547'); gwat.addColorStop(0.30,'#061a36'); gwat.addColorStop(1,'#010710');
  ctx.fillStyle = gwat; ctx.fillRect(0,meshTopY,W,H-meshTopY);

  if (stars){ ctx.globalCompositeOperation='lighter'; ctx.drawImage(stars,0,0,W,meshTopY+10); }

  /* 수평선 발광 */
  ctx.globalCompositeOperation = 'lighter';
  var hr = ctx.createRadialGradient(W*0.5,meshTopY,0,W*0.5,meshTopY,W*0.45);
  hr.addColorStop(0,'rgba(255,240,210,0.26)');
  hr.addColorStop(0.32,'rgba(176,214,255,0.10)');
  hr.addColorStop(1,'rgba(150,200,255,0)');
  ctx.fillStyle = hr; ctx.fillRect(0,meshTopY-H*0.14,W,H*0.24);
  var hl = ctx.createLinearGradient(0,0,W,0);
  hl.addColorStop(0,'rgba(146,192,238,0.10)');
  hl.addColorStop(0.5,'rgba(230,242,255,0.44)');
  hl.addColorStop(1,'rgba(146,192,238,0.10)');
  ctx.fillStyle = hl; ctx.fillRect(0,meshTopY-0.9,W,1.8);

  /* 메시 — 가로(주선) / 세로 / 대각(보조선) */
  for (b=0;b<6;b++){ PR[b]=new Path2D(); PC[b]=new Path2D(); PD[b]=new Path2D(); }
  var cb;
  for (j=0;j<ROWS;j++){
    base = j*COLS; cb = -1;
    for (i=0;i<COLS-1;i++){
      idx = base+i; b = BV[idx]; b2 = BV[idx+1]; if (b2>b) b = b2;
      if (b !== cb){ PR[b].moveTo(SX[idx],SY[idx]); cb = b; }
      PR[b].lineTo(SX[idx+1],SY[idx+1]);
    }
  }
  for (i=0;i<COLS;i++){
    cb = -1;
    for (j=0;j<ROWS-1;j++){
      idx = j*COLS+i; idx2 = idx+COLS;
      b = BV[idx]; b2 = BV[idx2]; if (b2>b) b = b2;
      if (b !== cb){ PC[b].moveTo(SX[idx],SY[idx]); cb = b; }
      PC[b].lineTo(SX[idx2],SY[idx2]);
    }
  }
  if (TIERS[TIER].diag){
    for (j=0;j<ROWS-1;j++){
      base = j*COLS; cb = -1;
      for (i=0;i<COLS-1;i++){
        var ia = (i&1) ? base+COLS+i : base+i;
        var ib = (i&1) ? base+i+1    : base+COLS+i+1;
        b = BV[ia]; b2 = BV[ib]; if (b2>b) b = b2;
        if (b !== cb){ PD[b].moveTo(SX[ia],SY[ia]); cb = b; }
        PD[b].lineTo(SX[ib],SY[ib]);
      }
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (var fam=0; fam<3; fam++){
    if (fam===2 && !TIERS[TIER].diag) continue;
    var set = fam===0 ? PR : (fam===1 ? PC : PD);
    ctx.globalAlpha = fam===0 ? 1 : (fam===1 ? 0.62 : 0.44);
    var wmul       = fam===0 ? 1 : (fam===1 ? 0.72 : 0.58);
    for (b=0;b<6;b++){
      ctx.strokeStyle = STROKE[b][0];
      ctx.lineWidth   = STROKE[b][1]*wmul;
      ctx.stroke(set[b]);
    }
  }
  ctx.globalAlpha = 1;

  /* 절점 */
  if (TIERS[TIER].dots){
    for (b=0;b<6;b++) D[b] = new Path2D();
    for (j=0;j<ROWS;j++){
      if (!ROWDOT[j]) continue;
      base = j*COLS;
      var s = DOTSZ[j], hs = s*0.5, st = COLSTEP[j];
      for (i=0;i<COLS;i+=st){
        idx = base+i; b = BV[idx];
        if (b < 1) continue;
        D[b].rect(SX[idx]-hs, SY[idx]-hs, s, s);
      }
    }
    for (b=1;b<6;b++){ ctx.fillStyle = DOT[b][0]; ctx.fill(D[b]); }
  }

  /* 수평선 대기 흐림 */
  ctx.globalCompositeOperation = 'lighter';
  var hz = ctx.createLinearGradient(0,meshTopY,0,meshTopY+H*0.20);
  hz.addColorStop(0,'rgba(112,176,232,0.30)');
  hz.addColorStop(1,'rgba(112,176,232,0)');
  ctx.fillStyle = hz; ctx.fillRect(0,meshTopY,W,H*0.20);

  /* 하단 암전 + 비네트 */
  ctx.globalCompositeOperation = 'source-over';
  var bf = ctx.createLinearGradient(0,H*0.38,0,H);
  bf.addColorStop(0,'rgba(2,7,18,0)');
  bf.addColorStop(0.55,'rgba(2,7,18,0.26)');
  bf.addColorStop(1,'rgba(2,7,18,0.62)');
  ctx.fillStyle = bf; ctx.fillRect(0,H*0.38,W,H*0.62);
  // 좌측 스크림 — 히어로 텍스트가 놓이는 쪽만 살짝 눌러 가독성 확보
  var ls = ctx.createLinearGradient(0,0,W*0.66,0);
  ls.addColorStop(0,'rgba(2,7,18,0.40)');
  ls.addColorStop(0.55,'rgba(2,7,18,0.16)');
  ls.addColorStop(1,'rgba(2,7,18,0)');
  ctx.fillStyle = ls; ctx.fillRect(0,0,W*0.66,H);

  var vg = ctx.createRadialGradient(W*0.5,H*0.5,Math.min(W,H)*0.30,W*0.5,H*0.5,Math.max(W,H)*0.80);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
}

/* ---------------- 루프 / 자동 품질 ---------------- */
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var tSim=0, last=0, ema=16.7, slow=0, rafId=0;

function loop(now){
  rafId = requestAnimationFrame(loop);
  if (!last) last = now;
  var dt = Math.min(now-last, 50); last = now;
  tSim += dt*0.001*uSpd;

  var t1 = performance.now();
  render(tSim);
  ema = ema*0.92 + (performance.now()-t1)*0.08;

  if (AUTO && TIER < TIERS.length-1){
    if (ema > 20){ if (++slow > 60){ TIER++; slow=0; ema=16.7; build(); } }
    else slow = 0;
  }
}
function start(){ if (reduce){ render(0); return; } if (!rafId) rafId = requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', function(){
  if (document.hidden){ if (rafId){ cancelAnimationFrame(rafId); rafId=0; } }
  else { last=0; start(); }
});
var rt=null;
window.addEventListener('resize', function(){
  clearTimeout(rt); rt = setTimeout(function(){ build(); if (reduce) render(tSim); }, 160);
});

var q0 = attr('quality', -1);
TIER = (q0 >= 0) ? Math.max(0, Math.min(TIERS.length-1, Math.round(q0))) : pickStartTier();
build(); start();

})();
