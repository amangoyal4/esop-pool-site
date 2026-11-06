// The published read-only link (GitHub Pages). Only included by tools/build_site.py, never by the desk app.
// Every response the pages need is a file under d/, gzip-compressed then AES-256-GCM encrypted with a key derived
// from the desk password (PBKDF2-SHA256). File names are an HMAC of the request, so even the list of files says
// nothing without the password. The password is never stored; the derived key lives in this tab's
// sessionStorage until the tab closes, the desk signs out, or 3 hours pass without activity.
window.SITE = (() => {
  const IDLE_MS = 3 * 3600 * 1000;
  const enc = new TextEncoder();
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const toB64 = u => btoa(String.fromCharCode(...u));
  let aesKey = null, macKey = null, meta = null;

  async function useKeys(raw){
    aesKey = await crypto.subtle.importKey('raw', raw.slice(0, 32), 'AES-GCM', false, ['decrypt']);
    macKey = await crypto.subtle.importKey('raw', raw.slice(32, 64), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  }
  async function derive(pw){
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', salt: fromB64(meta.salt), iterations: meta.iterations, hash: 'SHA-256'}, base, 512));
  }
  // same canonical form as tools/build_site.py: decoded path, query sorted by name, no refresh flag
  function canon(path){
    const u = new URL(path, 'https://x/');
    const q = [...u.searchParams].filter(([k]) => k !== 'refresh').sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    return decodeURIComponent(u.pathname) + (q.length ? '?' + q.map(([k, v]) => `${k}=${v}`).join('&') : '');
  }
  async function fileOf(path){
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', macKey, enc.encode(canon(path))));
    return [...sig].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }
  async function read(path){
    const r = await fetch(`d/${await fileOf(path)}.bin`, {cache: 'no-cache'});
    if(!r.ok) throw new Error('This view is not in the published snapshot.');
    const buf = new Uint8Array(await r.arrayBuffer());
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: buf.slice(0, 12)}, aesKey, buf.slice(12));
    const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }
  function touch(){ try{ sessionStorage.setItem('esop_t', String(Date.now())); } catch(e){} }
  function signOut(){ try{ sessionStorage.removeItem('esop_k'); sessionStorage.removeItem('esop_t'); } catch(e){} location.reload(); }

  async function get(path){
    let t = 0; try{ t = +sessionStorage.getItem('esop_t') || 0; } catch(e){}
    if(t && Date.now() - t > IDLE_MS){ signOut(); throw new Error('signed out'); }
    touch();
    return read(path);
  }

  function gate(resolve){
    const el = document.createElement('div');
    el.className = 'gate';
    el.innerHTML = `<form class="gate-card" autocomplete="off">
      <img src="static/logo-gold.png" alt="Guardian Capital" class="gate-logo">
      <div class="eyebrow">Private desk</div><h1>ESOP Pool</h1>
      <p class="gate-sub">Client ESOP holdings and the weekly review. Read-only link.</p>
      <label for="gpw">Desk password</label><input id="gpw" type="password" autocomplete="current-password" required>
      <p class="gate-err" id="gerr"></p><button type="submit">Sign in</button></form>`;
    document.body.appendChild(el);
    const pw = el.querySelector('#gpw'), err = el.querySelector('#gerr'), btn = el.querySelector('button');
    pw.focus();
    el.querySelector('form').onsubmit = async ev => {
      ev.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Opening…';
      try{
        const raw = await derive(pw.value);
        await useKeys(raw);
        await read('/__check');                       // fails on a wrong password (the tag does not verify)
        try{ sessionStorage.setItem('esop_k', toB64(raw)); } catch(e){}
        touch(); el.remove(); resolve();
      } catch(e){ err.textContent = 'Wrong password.'; btn.disabled = false; btn.textContent = 'Sign in'; pw.select(); }
    };
  }

  async function unlock(){
    document.body.classList.add('ro');
    // sign-out and the Excel export point at server routes the published link does not have
    document.addEventListener('click', e => { const a = e.target.closest('a[href="/logout"]'); if(a){ e.preventDefault(); signOut(); } });
    meta = await (await fetch('d/meta.json', {cache: 'no-cache'})).json();
    let saved = null, t = 0;
    try{ saved = sessionStorage.getItem('esop_k'); t = +sessionStorage.getItem('esop_t') || 0; } catch(e){}
    if(saved && Date.now() - t < IDLE_MS){
      try{ await useKeys(fromB64(saved)); await read('/__check'); touch(); return; } catch(e){}
    }
    return new Promise(gate);
  }

  return {unlock, get, signOut};
})();
