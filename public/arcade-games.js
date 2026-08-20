import {injectStyles} from './arcade-common.js';
import {openMine,injectMinePremiumStyles,mineCardArt} from './arcade-minedrop.js';

export function installArcades(){
  injectStyles();
  injectMinePremiumStyles();
  const go=()=>{
    const grid=document.getElementById('slotGrid');
    if(!grid)return setTimeout(go,120);
    if(document.getElementById('arcadeFeatureGrid'))return;
    const w=document.createElement('section');
    w.className='arcade-section mine-feature-section';
    w.innerHTML=`<div class="arcade-title mine-feature-title">
      <div><small>CASINO ORIGINAL</small><h2>Mine Drop</h2></div>
      <span>MINING GAME</span>
    </div>
    <div class="arcade-feature-grid mine-only-grid" id="arcadeFeatureGrid">
      <button class="arcade-card mine-card mine-premium-card">
        ${mineCardArt()}
        <div class="arcade-card-copy mine-premium-copy">
          <small>95–96% RTP · MAX ×5000</small>
          <h3>MINE DROP</h3>
          <p>Кирки реально пробивают шахту. TNT взрывает соседние колонки, Eye запускает 4 persistent Free Spins, а внизу ждут сундуки ×2–×100.</p>
          <b>ENTER THE MINE →</b>
        </div>
      </button>
    </div>`;
    grid.parentNode.insertBefore(w,grid);
    w.querySelector('.mine-premium-card').onclick=openMine;
  };
  go();
}
