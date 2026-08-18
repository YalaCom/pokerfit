import {$,nav} from "./core.js";

export function initClubAgreement(){
  installAgreementView();
  installSettingsEntry();
}

function installAgreementView(){
  if($("view-club-agreement"))return;
  const section=document.createElement("section");
  section.id="view-club-agreement";section.className="view";
  section.innerHTML=`
    <div class="page-title"><div><small>FIT POKER CLUB</small><h2>Соглашение клуба</h2></div></div>
    <article class="club-agreement-card">
      <div class="agreement-mark">♠</div>
      <h3>Шуточное казино для друзей</h3>
      <p>FIT Poker Club создан как развлекательный проект для друзей. Все игры, ставки, Jackpot, пополнения и выводы внутри проекта являются частью игровой механики и прикола.</p>
      <div class="agreement-rates"><div><small>ПОПОЛНЕНИЕ</small><b>1 ₽ → 500K фишек</b></div><div><small>ВЫВОД</small><b>1M фишек → 1 ₽</b></div></div>
      <p>Фишки используются внутри игры. Проект не является настоящим казино, платёжной системой или сервисом денежных переводов.</p>
      <label class="agreement-check"><input id="clubAgreementCheck" type="checkbox"><span>Я понимаю, что это шуточный проект для друзей, и согласен с правилами клуба.</span></label>
      <button id="clubAgreementAccept" class="gold-button" disabled>Я СОГЛАСЕН</button>
    </article>`;
  document.querySelector("main#app")?.appendChild(section);
  const check=$("clubAgreementCheck"),button=$("clubAgreementAccept");
  check.onchange=()=>button.disabled=!check.checked;
  button.onclick=()=>{localStorage.setItem("fit-club-agreement","accepted");nav("settings");};
  if(localStorage.getItem("fit-club-agreement")==="accepted"){check.checked=true;button.disabled=false;button.textContent="СОГЛАСИЕ ПРИНЯТО";}
}

function installSettingsEntry(){
  const settings=$("view-settings");if(!settings||$("clubAgreementEntry"))return;
  const button=document.createElement("button");button.id="clubAgreementEntry";button.className="line-card agreement-entry";
  button.innerHTML='<span><b>Соглашение клуба</b><small>Отдельная страница о шуточном казино для друзей</small></span><i>→</i>';
  settings.appendChild(button);button.onclick=()=>nav("club-agreement");
}
