import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = path.join(ROOT, 'tests', 'e2e', 'artifacts');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:3001/?q2=' + Date.now(), { waitUntil: 'networkidle' });

await page.evaluate(() => {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('screen-quiz').classList.remove('hidden');
  document.getElementById('quiz-bg').style.backgroundImage = "url('/assets/scenes/marsh.jpg')";
  document.getElementById('quiz-score').textContent = '0 : 0';
  document.getElementById('quiz-body').innerHTML =
    '<p class="quiz-q">红军过松潘草地时，部队最紧缺、也最常被战友相互推让的是什么？</p>' +
    '<div class="quiz-opts">' +
    '<button class="quiz-opt">A. 弹药</button>' +
    '<button class="quiz-opt">B. 口粮</button>' +
    '<button class="quiz-opt">C. 地图</button>' +
    '<button class="quiz-opt">D. 电台</button>' +
    '</div>';
});
await page.waitForTimeout(400);
const vis = await page.evaluate(() =>
  [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id)
);
console.log('vis', vis);
await page.screenshot({ path: path.join(ART, 'QUIZ-FIXED.png') });
await browser.close();
console.log('saved');
