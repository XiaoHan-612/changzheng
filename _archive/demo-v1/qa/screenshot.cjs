const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text()); });

  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'qa/01-title.png', fullPage: false });
  console.log('shot title');

  // how to play
  await page.click('#btn-how');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'qa/02-how.png' });
  await page.click('#btn-how-back');
  await page.waitForTimeout(200);

  // start
  await page.click('#btn-start');
  // skip cutscene quickly
  await page.waitForTimeout(500);
  await page.click('#btn-cut-skip');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa/03-camp.png' });
  console.log('shot camp, AP dots=', await page.locator('.ap-dot.on').count());
  console.log('actions=', await page.locator('.action-card').count());
  console.log('companions=', await page.locator('.comp-item').count());

  // talk flow
  await page.locator('.action-card', { hasText: '交谈' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'qa/04-talk-who.png' });
  await page.locator('#talk-who .btn.choice', { hasText: '老班长' }).click();
  await page.waitForTimeout(500);
  await page.fill('#talk-input', '你为什么总把吃的让给别人？');
  await page.click('#talk-send');
  // wait for AI
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'qa/05-talk-reply.png' });
  const dlg = await page.locator('#dlg-body').innerText();
  console.log('dialogue:', dlg.slice(0,80));
  await page.click('#talk-end');
  await page.waitForTimeout(400);

  // second action: rest
  await page.locator('.action-card', { hasText: '休息' }).click();
  await page.waitForTimeout(1500);
  // wait button
  const waitBtn = page.locator('#stage-panel .btn.primary');
  if (await waitBtn.count()) await waitBtn.first().click();
  await page.waitForTimeout(300);

  // day2?
  const day = await page.locator('#day-num').innerText();
  console.log('day after 2 actions:', day);

  // if still day1 with 0 AP, click march twice through days
  for (let i=0;i<3;i++) {
    page.once('dialog', d => d.accept());
    if (await page.locator('#btn-march').isVisible()) {
      await page.click('#btn-march');
      await page.waitForTimeout(500);
    }
  }
  await page.screenshot({ path: 'qa/06-after-march.png' });
  console.log('screen after march, day=', await page.locator('#day-num').innerText().catch(()=>'n/a'));
  console.log('thinking visible=', !(await page.locator('#thinking').evaluate(el=>el.classList.contains('hidden'))).valueOf());

  // logs panel
  await page.click('#btn-logs');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'qa/07-logs.png' });
  const logCount = await page.locator('.log-item').count();
  console.log('log items:', logCount);

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
