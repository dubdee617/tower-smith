// 使い方: node pp.js URL out.png [js式]  — ページを開いて、コンソールと例外を表示
const p = require('puppeteer-core');
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--no-proxy-server', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage(); await pg.setViewport({ width: +(process.env.W || 390), height: +(process.env.H || 844), deviceScaleFactor: 1 });
  pg.on('console', m => { const t = m.text(); if (!/Failed to load resource/.test(t)) console.log('LOG', t.slice(0, 300)); });
  pg.on('pageerror', e => console.log('ERR', e.message.slice(0, 300)));
  pg.setDefaultTimeout(15000);
  try { await pg.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) { console.log('goto', e.message); }
  if (process.env.SHOTS) { let t0 = 0; for (const t of process.env.SHOTS.split(',').map(Number)) { await new Promise(r => setTimeout(r, t - t0)); t0 = t; try { await pg.screenshot({ path: process.argv[3].replace('.png', '_' + t + '.png') }); } catch (e) { console.log('SHOT', e.message); } } }
  await new Promise(r => setTimeout(r, +(process.env.WAIT || 3500)));
  if (process.argv[4]) { try { const r = await Promise.race([pg.evaluate(process.argv[4]), new Promise((_, j) => setTimeout(() => j(new Error('eval timeout')), 8000))]); console.log('RES', typeof r === 'string' ? r : JSON.stringify(r)); } catch (e) { console.log('EVALERR', e.message); } }
  try { await Promise.race([pg.screenshot({ path: process.argv[3] }), new Promise((_, j) => setTimeout(() => j(new Error('shot timeout')), 8000))]); } catch (e) { console.log('SHOT', e.message); }
  await b.close(); process.exit(0);
})();
