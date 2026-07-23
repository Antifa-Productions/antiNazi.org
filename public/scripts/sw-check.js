const out = document.getElementById('output');
const btn = document.getElementById('registerBtn');

async function check() {
  if (!('serviceWorker' in navigator)) {
    out.textContent = '❌ Service Workers not supported\nThis browser does not support SW';
    return;
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw-idb.mjs');
    
    if (!reg) {
      out.innerHTML = '❌ No SW registration found<br/><br/>Click "Register SW" to try.';
      return;
    }

    out.innerHTML = `
      ✓ SW Registration Found<br/>
      <hr/>
      Scope: ${reg.scope}<br/>
      Active Worker: ${reg.active ? reg.active.state : 'none'}<br/>
      Installing: ${reg.installing ? reg.installing.state : 'none'}<br/>
      Waiting: ${reg.waiting ? reg.waiting.state : 'none'}<br/>
      <hr/>
      Controller present: ${navigator.serviceWorker.controller ? 'YES ✓' : 'NO ✗'}<br/>
      Controller URL: ${navigator.serviceWorker.controller?.scriptURL || 'none'}<br/>
    `;

    if (navigator.serviceWorker.controller) {
      try {
        const msgChannel = new MessageChannel();
        navigator.serviceWorker.controller.postMessage({ type: 'PING' }, [msgChannel.port2]);
        
        msgChannel.port1.onmessage = (e) => {
          out.innerHTML += `<br/>✓ Message test: ${e.data?.type || e.data}`;
        };
        
        setTimeout(() => {
          out.innerHTML += `<br/>(No response from SW within 2s)`;
        }, 2000);
      } catch (err) {
        out.innerHTML += `<br/>Message test failed: ${err.message}`;
      }
    }

  } catch (err) {
    out.textContent = '❌ Error checking SW: ' + err.message;
  }
}

btn.onclick = async () => {
  btn.disabled = true;
  btn.textContent = 'Registering...';
  
  try {
    const reg = await navigator.serviceWorker.register('/sw-idb.mjs', {
      scope: '/',
      type: 'module',
      updateViaCache: 'none'
    });
    
    out.innerHTML += '<br/><br/>✓ Registration started!';
    out.innerHTML += `<br/>State: ${reg.installing?.state || 'pending'}`;
    out.innerHTML += `<br/>Scope: ${reg.scope}`;
    
    reg.addEventListener('install', () => {
      out.innerHTML += `<br/>✓ Install event fired`;
    });
    
    reg.addEventListener('activate', () => {
      out.innerHTML += `<br/>✓ Activate event fired`;
    });
    
    reg.addEventListener('updatefound', () => {
      out.innerHTML += `<br/>🔄 Update found`;
    });
    
  } catch (err) {
    out.innerHTML += `<br/><br/>❌ Registration failed:<br/>${err.message}`;
    if (err.stack) {
      out.innerHTML += `<br/><br/>Stack:<br/>${err.stack}`;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register SW';
  }
};

check();
