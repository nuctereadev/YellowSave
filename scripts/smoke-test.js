const BASE = process.env.BASE_URL || 'http://localhost:3000';

class Jar {
  constructor(){ this.cookies = {}; }
  header(){ return Object.entries(this.cookies).map(([k,v])=>`${k}=${v}`).join('; '); }
  update(res){
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of sc) {
      const m = c.match(/^([^=]+)=([^;]*)/);
      if (m) this.cookies[m[1]] = m[2];
    }
  }
}

async function req(jar, path, opts={}){
  const headers = Object.assign({}, opts.headers||{});
  if (jar) headers['Cookie'] = jar.header();
  const res = await fetch(BASE + path, Object.assign({}, opts, { headers }));
  if (jar) jar.update(res);
  const ct = res.headers.get('content-type')||'';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

(async () => {
  // csrf
  const jarA = new Jar();
  let r = await req(jarA, '/api/auth/csrf-token');
  console.log('csrf', r.status, r.data.csrfToken ? 'ok' : 'MISSING');
  const csrfA = r.data.csrfToken;

  // register user A
  r = await req(jarA, '/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrfA}, body: JSON.stringify({username:'alice', password:'password123', confirmPassword:'password123'}) });
  console.log('register A', r.status, r.data);
  const csrfA2 = (await req(jarA, '/api/auth/me')).data.csrfToken;
  // Actually fetch me to get csrf
  r = await req(jarA, '/api/auth/me');
  console.log('me A', r.status, r.data.user && r.data.user.username);

  // duplicate username
  const jarX = new Jar();
  await req(jarX, '/api/auth/csrf-token');
  r = await req(jarX, '/api/auth/csrf-token');
  const csx = r.data.csrfToken;
  r = await req(jarX, '/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csx}, body: JSON.stringify({username:'ALICE', password:'password123', confirmPassword:'password123'}) });
  console.log('duplicate register', r.status, r.data.error);

  // invalid login
  const jarB = new Jar();
  await req(jarB, '/api/auth/csrf-token');
  const csb = (await req(jarB, '/api/auth/csrf-token')).data.csrfToken;
  r = await req(jarB, '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csb}, body: JSON.stringify({username:'alice', password:'wrong'}) });
  console.log('invalid login', r.status, r.data.error);

  // user B register
  r = await req(jarB, '/api/auth/register', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csb}, body: JSON.stringify({username:'bob', password:'password123', confirmPassword:'password123'}) });
  console.log('register B', r.status);

  // A adds media
  const csa = (await req(jarA, '/api/auth/me')).data.csrfToken;
  r = await req(jarA, '/api/media', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csa}, body: JSON.stringify({title:'Inception', type:'movie', status:'watched', year:'2010', rating:'9', poster:'', progress:'', notes:'great'}) });
  console.log('add media A', r.status, r.data.item && r.data.item.title);
  const mediaIdA = r.data.item.id;

  // B cannot see A's
  const csb2 = (await req(jarB, '/api/auth/me')).data.csrfToken;
  r = await req(jarB, '/api/media');
  console.log('B media count', r.data.items.length);
  r = await req(jarB, '/api/media/'+mediaIdA);
  console.log('B get A media', r.status);

  // B tries delete A's media
  r = await req(jarB, '/api/media/'+mediaIdA, { method:'DELETE', headers:{'X-CSRF-Token':csb2} });
  console.log('B delete A media', r.status);

  // unauthenticated
  r = await req(new Jar(), '/api/media');
  console.log('unauth media', r.status);

  // edit + delete by A
  r = await req(jarA, '/api/media/'+mediaIdA, { method:'PUT', headers:{'Content-Type':'application/json','X-CSRF-Token':csa}, body: JSON.stringify({title:'Inception 2', type:'movie', status:'watched', year:'2010', rating:'9', poster:'', progress:'', notes:'great'}) });
  console.log('edit A', r.status, r.data.item && r.data.item.title);
  r = await req(jarA, '/api/media/'+mediaIdA, { method:'DELETE', headers:{'X-CSRF-Token':csa} });
  console.log('delete A', r.status);

  // import backup test
  const fs = require('fs');
  const backup = JSON.parse(fs.readFileSync('C:/Users/Asus/Documents/Default Project/YellowSave/yellowreel (8).json','utf8'));
  // remove a few? use all
  r = await req(jarA, '/api/import', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csa}, body: JSON.stringify(backup) });
  console.log('import', r.status, r.data);
  r = await req(jarA, '/api/media');
  console.log('A media after import', r.data.items.length);

  // export
  r = await req(jarA, '/api/export');
  console.log('export status', r.status, typeof r.data);
  let parsed = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  console.log('export app/version/items', parsed.app, parsed.version, parsed.items.length);

  // profile
  r = await req(jarA, '/api/profile');
  console.log('profile', r.status, r.data.stats);

  // change password
  r = await req(jarA, '/api/auth/change-password', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csa}, body: JSON.stringify({currentPassword:'password123', newPassword:'newpassword123', confirmPassword:'newpassword123'}) });
  console.log('change pw', r.status, r.data);

  // logout
  r = await req(jarA, '/api/auth/logout', { method:'POST', headers:{'X-CSRF-Token':csa} });
  console.log('logout', r.status);

  // session persistence check: login again
  const jarA2 = new Jar();
  await req(jarA2, '/api/auth/csrf-token');
  const csa3 = (await req(jarA2, '/api/auth/csrf-token')).data.csrfToken;
  r = await req(jarA2, '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csa3}, body: JSON.stringify({username:'alice', password:'newpassword123'}) });
  console.log('relogin', r.status);

  console.log('DONE');
})();
