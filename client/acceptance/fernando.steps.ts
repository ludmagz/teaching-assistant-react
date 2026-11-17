import { Given, When, Then, Before, After, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { launch, Browser, Page } from 'puppeteer';
import express from 'express';
import { Server } from 'http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import assert from 'assert/strict';
import { createApp } from '../../server/src/app';
import { StudentSet } from '../../server/src/models/StudentSet';
import { Classes } from '../../server/src/models/Classes';
import { JsonFileRepository } from '../../server/src/persistence/JsonFileRepository';

setDefaultTimeout(15000);
let browser: Browser;
let page: Page;
let apiServer: Server;
let staticServer: Server;
let directory: string;
let actionStarted = false;
const api = 'http://localhost:3005';
const site = 'http://localhost:3004';
const classId = 'ESS-2026-1';
const classPath = `/api/classes/${classId}`;
const evaluationPath = `${classPath}/enrollments/12345678901/evaluation`;
const goals = ['Requisitos', 'Testes', 'Saas'];

async function send(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(api + path, { method,
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await (!response.ok ? response.text() : Promise.resolve(''))}`);
  return response.status === 204 ? undefined : response.json();
}
const listen = (app: express.Express, port: number) => new Promise<Server>((resolveServer, reject) => {
  const server = app.listen(port, () => resolveServer(server));
  server.once('error', reject);
});
const close = (server?: Server) => new Promise<void>((done, reject) => {
  if (!server) { done(); return; }
  server.close(error => error ? reject(error) : done());
  server.closeAllConnections();
});
async function openEvaluations() {
  await page.goto(site);
  await page.waitForSelector('[data-testid="evaluations-tab"]');
  await page.click('[data-testid="evaluations-tab"]');
  await page.waitForSelector('#classSelect');
  await page.waitForFunction(id => Array.from(document.querySelectorAll('#classSelect option')).some(o => (o as HTMLOptionElement).value === id), {}, classId);
  await page.select('#classSelect', classId);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.student-name-cell')).some(cell => cell.textContent === 'Marina'));
}
async function waitReady() {
  await page.waitForFunction(() => {
    const input = document.querySelector('#averageType') as HTMLSelectElement | null;
    return input && !input.disabled && !!document.querySelector('[data-testid="numeric-average"]');
  });
}
BeforeAll({ timeout: 60000 }, async () => {
  mkdirSync('reports', { recursive: true });
  staticServer = await listen(express().use(express.static(resolve('build'))), 3004);
  browser = await launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX === '1' ? ['--no-sandbox'] : [] });
});
AfterAll(async () => {
  await browser?.close();
  await close(staticServer);
});
Before(async () => {
  actionStarted = false;
  directory = mkdtempSync(join(tmpdir(), 'fernando-bdd-'));
  apiServer = await listen(createApp({ students: new StudentSet(), classes: new Classes(),
    repository: new JsonFileRepository(join(directory, 'app-data.json')) }), 3005);
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await send('/api/students', 'POST', { name: 'Marina', cpf: '12345678901', email: 'marina@example.com' });
  await send('/api/classes', 'POST', { topic: 'ESS', year: 2026, semester: 1 });
  await send(`${classPath}/enroll`, 'POST', { studentCPF: '12345678901' });
});
After(async function ({ pickle, result }) {
  try {
    if (page) {
      const filename = `reports/${pickle.id}.png` as const;
      const screenshot = await page.screenshot({ path: filename, fullPage: true });
      await this.attach(Buffer.from(screenshot), 'image/png');
      await this.attach(`${pickle.name}: ${result?.status}`, 'text/plain');
      // Confirm persistence really contains the grade entered through the GUI.
      if (actionStarted) {
        await new Promise<void>(done => setImmediate(done));
        const stored = JSON.parse(readFileSync(join(directory, 'app-data.json'), 'utf8'));
        const live = await send(`${classPath}/enrollments`);
        assert.deepEqual(stored.classes[0].enrollments[0].evaluations, live[0].evaluations);
      }
    }
  } finally {
    await page?.close();
    await close(apiServer);
    await new Promise<void>(done => setImmediate(done));
    rmSync(directory, { recursive: true, force: true });
  }
});
Given('estou na página {string} na turma {string}', async (name: string, className: string) => {
  assert.equal(name, 'Evaluations'); assert.equal(className, 'ESS - (2026/1)');
  await openEvaluations();
});
Given('a opção {string} está selecionada', async (type: string) => {
  assert.equal(type, 'média simples');
  assert.ok(await page.$('#averageType'), 'Campo Tipo de Média não encontrado em Evaluations');
  await page.select('#averageType', 'simple');
  await page.waitForFunction(() => (document.querySelector('#averageType') as HTMLSelectElement)?.value === 'simple');
});
Given('nenhuma opção está selecionada no campo {string}', async (label: string) => {
  assert.equal(label, 'Tipo de Média');
  assert.ok(await page.$('#averageType'), 'Campo Tipo de Média não encontrado em Evaluations');
  assert.equal(await page.$eval('#averageType', el => (el as HTMLSelectElement).value), '');
});
const rowPattern = /^na linha da aluna "([^"]+)" vejo as notas "([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\s*nas metas "([^"]+)", "([^"]+)" e "([^"]+)", respectivamente e média "([^"]+)"$/;
// The same sentence describes initial fixtures in Given and observations in Then.
// Only pre-action steps arrange data; every occurrence checks the actual DOM.
Given(rowPattern, async (student: string, a: string, b: string, c: string, ga: string, gb: string, gc: string, mean: string) => {
  assert.equal(student, 'Marina'); assert.deepEqual([ga, gb, gc], goals);
  if (!actionStarted) {
    for (const [i, grade] of [a, b, c].entries()) {
      if (grade === '-') continue;
      const selector = `input[aria-label="${student} — ${goals[i]}"]`;
      assert.ok(await page.$(selector), `Campo de nota não encontrado: ${student} / ${goals[i]}`);
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type(selector, grade);
      const saved = page.waitForResponse(r => r.url().endsWith('/evaluation') && r.request().method() === 'PUT' && r.ok());
      await page.keyboard.press('Enter'); await saved;
    }
  }
  await waitReady();
  const displayed = await page.$$eval('.student-row', (rows, name) => {
    const row = rows.find(row => row.querySelector('.student-name-cell')?.textContent === name);
    return Array.from(row?.querySelectorAll('input') || []).map(el => (el as HTMLInputElement).value);
  }, student);
  assert.deepEqual(displayed.map(x => x === '' ? '-' : Number(x).toFixed(1)), [a, b, c]);
  assert.equal(await page.$eval('[data-testid="numeric-average"]', el => el.textContent), mean);
});
When('registro a nota {string} na meta {string}', async (grade: string, goal: string) => {
  actionStarted = true;
  await waitReady();
  const selector = `input[aria-label="Marina — ${goal}"]`;
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace'); await page.type(selector, grade);
  const saved = page.waitForResponse(r => r.url().endsWith('/evaluation') && r.request().method() === 'PUT' && r.ok());
  await page.keyboard.press('Enter'); await saved;
  await waitReady();
  await page.waitForFunction((selector, grade) => (document.querySelector(selector) as HTMLInputElement | null)?.value === String(Number(grade)), {}, selector, grade);
});
Then('eu continuo na página {string} na turma {string}', async (name: string, className: string) => {
  assert.equal(name, 'Evaluations'); assert.equal(className, 'ESS - (2026/1)');
  assert.equal(await page.$eval('#classSelect', el => (el as HTMLSelectElement).value), classId);
  assert.equal(await page.$eval('.evaluation-section h3', el => el.textContent), name);
});
Then('eu vejo uma mensagem de aviso sobre o tipo de média', async () => {
  await page.waitForSelector('[role="alert"]');
  assert.match(await page.$eval('[role="alert"]', el => el.textContent || ''), /Tipo de Média/);
});
Then('o campo {string} da aluna {string} não está colorida', async (field: string, student: string) => {
  assert.equal(field, 'média'); assert.equal(student, 'Marina');
  assert.equal(await page.$eval('[data-testid="numeric-average"]', el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
});
Then('o campo {string} da aluna {string} está colorido de verde', async (field: string, student: string) => {
  assert.equal(field, 'média'); assert.equal(student, 'Marina');
  assert.equal(await page.$eval('[data-testid="numeric-average"]', el => getComputedStyle(el).backgroundColor), 'rgb(209, 250, 229)');
});
Then('abaixo das linhas dos alunos tem a legenda das cores', async () => {
  assert.ok(await page.$('[data-testid="average-legend"]'), 'Legenda das cores não encontrada abaixo da tabela');
  const below = await page.evaluate(() => document.querySelector('[data-testid="average-legend"]')!.getBoundingClientRect().top >= document.querySelector('.evaluation-table')!.getBoundingClientRect().bottom);
  assert.ok(below);
});
Then('a cor {word} tem a informação {string}', async (color: string, label: string) => {
  const colors: Record<string, [string, string]> = { verde: ['approved', 'rgb(209, 250, 229)'], amarelo: ['final', 'rgb(254, 243, 199)'], vermelho: ['failed', 'rgb(254, 202, 202)'] };
  const [status, rgb] = colors[color];
  const value = await page.$eval(`[data-testid="average-legend"] .average-${status}`, el => ({ text: el.textContent, background: getComputedStyle(el).backgroundColor }));
  assert.deepEqual(value, { text: label, background: rgb });
});
