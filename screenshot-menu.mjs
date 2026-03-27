import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 2500, height: 843, deviceScaleFactor: 1 });
await page.goto(`file://${path.join(__dirname, 'rich-menu.html')}`);
await page.screenshot({ path: path.join(__dirname, 'rich-menu.png'), type: 'png' });
await browser.close();
console.log('Done: rich-menu.png');
