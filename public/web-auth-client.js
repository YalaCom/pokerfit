const API="/api/web-auth";

export async function ensureBrowserAuth({onStatus=()=>{}}={}){
  onStatus("CHECKING WEB SESSION");
  try{const s=await post("/status",{});if(s.authenticated)return true;}catch{}
  return new Promise(resolve=>mountAuth(resolve,onStatus));
}

function mountAuth(resolve,onStatus){
  document.getElementById("fitWebAuth")?.remove();
  const root=document.createElement("section");root.id="fitWebAuth";root.className="fit-web-auth";
  root.innerHTML=`
    <style>${styles()}</style>
    <div class="fit-auth-glow fit-auth-glow-a"></div><div class="fit-auth-glow fit-auth-glow-b"></div>
    <div class="fit-auth-card">
      <div class="fit-auth-brand"><small>FIT CASINO</small><h1>Вход в игровой аккаунт</h1><p>В браузере можно создать новый аккаунт или подключить уже существующий аккаунт из Telegram.</p></div>
      <div class="fit-auth-tabs"><button data-mode="login" class="active">ВОЙТИ</button><button data-mode="register">РЕГИСТРАЦИЯ</button></div>
      <form id="fitLoginForm" class="fit-auth-form">
        <label><span>ЛОГИН</span><input id="fitLogin" autocomplete="username" maxlength="32" placeholder="например player01" required></label>
        <label><span>ПАРОЛЬ</span><input id="fitPassword" type="password" autocomplete="current-password" maxlength="72" placeholder="минимум 8 символов" required></label>
        <button class="fit-auth-primary" type="submit">ВОЙТИ</button>
      </form>
      <form id="fitRegisterForm" class="fit-auth-form hidden">
        <label><span>ИМЯ В КАЗИНО</span><input id="fitDisplayName" maxlength="40" placeholder="Как тебя показывать другим" required></label>
        <label><span>ЛОГИН</span><input id="fitRegisterLogin" autocomplete="username" maxlength="32" placeholder="латиница, цифры, _, -, ." required></label>
        <label><span>ПАРОЛЬ</span><input id="fitRegisterPassword" type="password" autocomplete="new-password" maxlength="72" placeholder="минимум 8 символов" required></label>
        <button class="fit-auth-primary" type="submit">СОЗДАТЬ АККАУНТ</button>
      </form>
      <div class="fit-auth-divider"><span>СТАРЫЙ АККАУНТ</span></div>
      <button id="fitTelegramLogin" class="fit-auth-telegram" type="button"><b>Войти через Telegram</b><small>Синхронизировать существующий баланс и историю</small></button>
      <div id="fitAuthStatus" class="fit-auth-status">Выбери способ входа</div>
    </div>`;
  document.body.appendChild(root);

  const loginForm=root.querySelector("#fitLoginForm"),registerForm=root.querySelector("#fitRegisterForm"),status=root.querySelector("#fitAuthStatus");
  root.querySelectorAll("[data-mode]").forEach(btn=>btn.onclick=()=>{
    root.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===btn));
    const register=btn.dataset.mode==="register";loginForm.classList.toggle("hidden",register);registerForm.classList.toggle("hidden",!register);setStatus(status,register?"Новый аккаунт получит стартовый баланс":"Введи логин и пароль");
  });

  const finish=()=>{onStatus("AUTHENTICATED");root.classList.add("done");setTimeout(()=>root.remove(),260);resolve(true);};

  loginForm.onsubmit=async e=>{
    e.preventDefault();const button=loginForm.querySelector("button");button.disabled=true;setStatus(status,"Проверяю аккаунт…");
    try{await post("/login",{login:root.querySelector("#fitLogin").value,password:root.querySelector("#fitPassword").value});finish();}
    catch(error){setStatus(status,errorText(error.message),true);button.disabled=false;}
  };

  registerForm.onsubmit=async e=>{
    e.preventDefault();const button=registerForm.querySelector("button");button.disabled=true;setStatus(status,"Создаю аккаунт…");
    try{await post("/register",{displayName:root.querySelector("#fitDisplayName").value,login:root.querySelector("#fitRegisterLogin").value,password:root.querySelector("#fitRegisterPassword").value});finish();}
    catch(error){setStatus(status,errorText(error.message),true);button.disabled=false;}
  };

  root.querySelector("#fitTelegramLogin").onclick=async()=>{
    const button=root.querySelector("#fitTelegramLogin");button.disabled=true;setStatus(status,"Подготавливаю защищённый вход через Telegram…");
    try{
      const link=await post("/telegram/start",{});
      setStatus(status,"Telegram открыт. В боте НАЖМИ START / ЗАПУСТИТЬ. После этого появится кнопка «Разрешить вход». Сайт ждёт автоматически.");
      const opened=window.open(link.deepLink,"_blank","noopener,noreferrer");if(!opened)location.href=link.deepLink;
      const started=Date.now();let finished=false,pendingHints=0;
      const check=async()=>{
        if(finished)return;
        if(Date.now()-started>5*60*1000){finished=true;button.disabled=false;setStatus(status,"Время входа истекло. Нажми «Войти через Telegram» ещё раз.",true);return;}
        try{
          const s=await post("/telegram/status",{token:link.token});
          if(s.authenticated){finished=true;finish();return;}
          if(s.status==="AWAITING_CONFIRM")setStatus(status,"Аккаунт найден. Теперь в Telegram нажми «✅ Разрешить вход».");
          else if(s.status==="NOT_FOUND"){finished=true;button.disabled=false;setStatus(status,"Старый аккаунт не найден. Зарегистрируй новый аккаунт на сайте.",true);return;}
          else if(s.status==="EXPIRED"){finished=true;button.disabled=false;setStatus(status,"Ссылка истекла. Запусти вход через Telegram ещё раз.",true);return;}
          else if(s.status==="PENDING"&&++pendingHints>=3)setStatus(status,"Если бот просто открылся и ничего не написал — нажми внизу START / ЗАПУСТИТЬ. Telegram не отправляет команду сам при одном открытии чата.");
        }catch{}
        setTimeout(check,1600);
      };
      setTimeout(check,1000);
    }catch(error){button.disabled=false;setStatus(status,errorText(error.message),true);}
  };
}

async function post(path,payload){
  const r=await fetch(`${API}${path}`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(payload||{})});let d;
  try{d=await r.json();}catch{throw new Error(`HTTP_${r.status}`);}if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP_${r.status}`);return d;
}
function setStatus(el,text,error=false){el.textContent=text;el.classList.toggle("error",!!error);}
function errorText(code){return ({BAD_WEB_LOGIN:"Логин: 3–32 символа, латиница/цифры/._-",BAD_DISPLAY_NAME:"Имя должно быть от 2 до 40 символов",BAD_WEB_PASSWORD:"Пароль должен быть от 8 до 72 символов",WEB_LOGIN_TAKEN:"Этот логин уже занят",WEB_LOGIN_FAILED:"Неверный логин или пароль",PLAYER_BANNED:"Аккаунт заблокирован",BAD_LOGIN_TOKEN:"Ссылка входа повреждена",TELEGRAM_WEBHOOK_FAILED:"Не удалось подключить бота к сайту. Попробуй ещё раз через несколько секунд."})[code]||String(code||"Ошибка входа").replaceAll("_"," ");}
function styles(){return `
.fit-web-auth{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 0,#17223a 0,#06080d 42%,#020305 100%);overflow:auto;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;transition:.25s ease}.fit-web-auth.done{opacity:0;transform:scale(1.015);pointer-events:none}.fit-auth-glow{position:fixed;width:360px;height:360px;border-radius:50%;filter:blur(90px);opacity:.18;pointer-events:none}.fit-auth-glow-a{background:#5f75ff;top:-140px;left:-120px}.fit-auth-glow-b{background:#d9a441;bottom:-180px;right:-120px}.fit-auth-card{position:relative;width:min(100%,440px);padding:28px;border:1px solid rgba(255,255,255,.11);border-radius:28px;background:linear-gradient(180deg,rgba(17,21,31,.96),rgba(7,9,14,.98));box-shadow:0 30px 90px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(22px)}.fit-auth-brand small{font-size:11px;font-weight:900;letter-spacing:.2em;color:#d8b665}.fit-auth-brand h1{margin:8px 0 8px;font-size:28px;line-height:1.05}.fit-auth-brand p{margin:0;color:#9ca6b8;font-size:14px;line-height:1.5}.fit-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:24px 0 18px;padding:5px;border-radius:15px;background:#05070b}.fit-auth-tabs button{height:42px;border:0;border-radius:11px;background:transparent;color:#778195;font-weight:900;font-size:12px;letter-spacing:.08em}.fit-auth-tabs button.active{background:#171c28;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.fit-auth-form{display:grid;gap:12px}.fit-auth-form.hidden{display:none}.fit-auth-form label{display:grid;gap:7px}.fit-auth-form label span{font-size:10px;font-weight:900;letter-spacing:.13em;color:#717c8e}.fit-auth-form input{width:100%;box-sizing:border-box;height:52px;padding:0 15px;border:1px solid #222a38;border-radius:14px;background:#080b11;color:#fff;font-size:16px;outline:none}.fit-auth-form input:focus{border-color:#7188ff;box-shadow:0 0 0 3px rgba(113,136,255,.12)}.fit-auth-primary,.fit-auth-telegram{border:0;cursor:pointer}.fit-auth-primary{height:54px;margin-top:4px;border-radius:15px;background:linear-gradient(135deg,#eff3ff,#9dacff);color:#080b12;font-weight:950;letter-spacing:.08em}.fit-auth-primary:disabled,.fit-auth-telegram:disabled{opacity:.55;cursor:wait}.fit-auth-divider{display:flex;align-items:center;gap:10px;margin:22px 0 14px;color:#596274;font-size:9px;font-weight:900;letter-spacing:.16em}.fit-auth-divider:before,.fit-auth-divider:after{content:"";height:1px;flex:1;background:#1a202c}.fit-auth-telegram{width:100%;min-height:62px;padding:12px 16px;border-radius:16px;background:linear-gradient(135deg,#122133,#0d1622);box-shadow:inset 0 0 0 1px #203954;color:#fff;text-align:left}.fit-auth-telegram b,.fit-auth-telegram small{display:block}.fit-auth-telegram b{font-size:15px}.fit-auth-telegram small{margin-top:4px;color:#8ba5c5;font-size:11px}.fit-auth-status{min-height:18px;margin-top:15px;color:#8d97a9;font-size:12px;line-height:1.45;text-align:center}.fit-auth-status.error{color:#ff879a}@media(max-width:520px){.fit-web-auth{padding:14px}.fit-auth-card{padding:22px;border-radius:23px}.fit-auth-brand h1{font-size:25px}}
`;}
