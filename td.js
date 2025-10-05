// Потрібні реальні файли td_web.js/wasm у цій же папці
const API_ID = 123456;           // <-- твій api_id
const API_HASH = "your_api_hash"; // <-- твій api_hash

const log = (m)=>{ const el=document.createElement('div'); el.className='msg'; el.textContent=m; document.querySelector('#tdlog').appendChild(el); };

async function main() {
  // 1) Ініт tdweb
  const client = new TdWeb.default({
    mode: 'wasm',     // 'wasm' або 'asmjs' залежно від збірки
    prefix: 'td',     // префікс для файлів wasm/worker (td_wasm.wasm, td_worker.js)
    readOnly: false
  });

  // 2) базова конфіг
  await client.send({
    '@type': 'setTdlibParameters',
    database_directory: 'db',
    use_message_database: true,
    use_secret_chats: false,
    api_id: API_ID,
    api_hash: API_HASH,
    system_language_code: 'en',
    device_model: 'NoirChat Chrome',
    application_version: '1.0.0',
    enable_storage_optimizer: true
  });
  await client.send({ '@type': 'checkDatabaseEncryptionKey', encryption_key: '' });

  // 3) Авторизація: статус → phone → code → (password якщо 2FA)
  client.onUpdate = (u) => {
    if (u['@type'] === 'updateAuthorizationState') {
      const s = u.authorization_state['@type'];
      log('Auth state: '+s);
      if (s === 'authorizationStateWaitPhoneNumber') askPhone(client);
      if (s === 'authorizationStateWaitCode')      askCode(client);
      if (s === 'authorizationStateWaitPassword')  askPassword(client);
      if (s === 'authorizationStateReady')         afterLogin(client);
    }
  };

  // старт
  await client.send({ '@type': 'getAuthorizationState' });
}

function askPhone(client) {
  document.querySelector('#start').onclick = async ()=>{
    const phone = document.querySelector('#phone').value.trim();
    await client.send({ '@type':'setAuthenticationPhoneNumber', phone_number: phone });
  };
}

function askCode(client) {
  const code = prompt('Введи код з SMS/Telegram:');
  if (!code) return;
  client.send({ '@type':'checkAuthenticationCode', code });
}

function askPassword(client) {
  const pwd = prompt('Пароль 2FA:');
  client.send({ '@type':'checkAuthenticationPassword', password: pwd || '' });
}

async function afterLogin(client) {
  log('Logged in!');
  // приклад: отримати список діалогів
  const chats = await client.send({ '@type':'getChats', offset_order: '9223372036854775807', offset_chat_id: 0, limit: 20 });
  log('Chats: '+JSON.stringify(chats));
}

main().catch(e=>log('ERR '+e.message));
