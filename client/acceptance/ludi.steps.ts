import { Given, When, Then, Before, After, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { launch, Browser, Page } from 'puppeteer';
import express from 'express';
import { Server } from 'http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import assert from 'assert/strict';
import { createApp } from '../../server/src/app';
import { StudentSet } from '../../server/src/models/StudentSet';
import { Classes } from '../../server/src/models/Classes';
import { JsonFileRepository } from '../../server/src/persistence/JsonFileRepository';
import { EVALUATION_GOALS } from '../src/types/Evaluation';

/**
 * Acceptance tests of ludi-definicao-calculo-media.feature, through the GUI
 * of the production build and a real server. Each scenario starts from an
 * empty system kept in a temporary JSON file, so that the classes of
 * previous versions (grades but no model) can also be set up.
 */

setDefaultTimeout(20000);

const api = 'http://localhost:3005';
const site = 'http://localhost:3004';
const YEAR = 2026;
const SEMESTER = 1;
const DEFAULT_TOPIC = 'Engenharia de Software e Sistemas';
const STUDENT = { name: 'Marina', cpf: '12345678901', email: 'marina@example.com' };
const LAST_GOAL = EVALUATION_GOALS[EVALUATION_GOALS.length - 1];

/** The names the feature uses for the models, and the values the system uses. */
const MODELS: Record<string, 'simple' | 'weighted' | 'concepts'> = {
  'Numérico de 0 a 10 sem pesos': 'simple',
  'média simples': 'simple',
  'Numérico de 0 a 10 com pesos': 'weighted',
  'Conceitos (MA, MPA, MANA)': 'concepts'
};

/** The errors the feature describes, and where and how the GUI shows them. */
const SETTINGS_ERROR = '[data-testid="average-calculation-settings"] [role="alert"]';
const ERRORS: Record<string, { selector: string; text: string }> = {
  'a nota de corte deve estar entre 0 e 10':
    { selector: SETTINGS_ERROR, text: 'The passing average must be between 0 and 10' },
  'a soma dos pesos deve resultar 10.':
    { selector: SETTINGS_ERROR, text: 'The sum of the goal weights must be 10' },
  'a média mínima para a prova final deve estar entre 0 e a nota de corte':
    { selector: SETTINGS_ERROR, text: 'The minimum average for the final exam must be between 0 and the passing average' },
  'a média mínima para a prova final é obrigatória':
    { selector: SETTINGS_ERROR, text: 'The minimum average for the final exam is required' },
  'o modelo não pode ser alterado em uma turma que já possui notas':
    { selector: SETTINGS_ERROR, text: 'The model cannot be changed in a class that already has grades' },
  'o modelo não é compatível com as notas já registradas na turma':
    { selector: SETTINGS_ERROR, text: 'The model is not compatible with the grades already recorded in the class' },
  // the GUI does not even let a grade be chosen; it tells why instead
  'o modelo de avaliação da turma deve ser definido antes do registro de notas':
    { selector: '.average-calculation-notice', text: 'Define the average calculation model before recording grades.' }
};

let browser: Browser;
let staticServer: Server;
let apiServer: Server | undefined;
let page: Page;
let directory: string;
let dataFile: string;

// State of the scenario being run
let actionStarted: boolean;               // a When step ran: Given-like sentences now check instead of arranging
let currentTopic: string;
let enrolledTopics: Set<string>;
let selectedModel: string | undefined;    // model chosen in the GUI by the scenario
let specificationBeforeSaving: unknown;
let gradeFieldWasDisabled: boolean;
let evaluationsBeforeRecording: unknown;

const classId = (topic: string) => `${topic}-${YEAR}-${SEMESTER}`;
const classPath = (topic: string) => `/api/classes/${encodeURIComponent(classId(topic))}`;
const cellSelector = (student: string, goal: string) => `[aria-label="${student} — ${goal}"]`;

async function send(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(api + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
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

/** Lets the server write its JSON file, which it does right after each change. */
const flushPersistence = () => new Promise<void>(done => setImmediate(done));

/** Starts the server from the JSON file, as it starts in production. */
async function startApi(): Promise<void> {
  const repository = new JsonFileRepository(dataFile);
  const students = new StudentSet();
  const classes = new Classes();
  repository.load(students, classes);
  apiServer = await listen(createApp({ students, classes, repository }), 3005);
}

async function storedClass(topic: string) {
  const classes = await send('/api/classes');
  const found = classes.find((c: any) => c.id === classId(topic));
  assert.ok(found, `Class ${classId(topic)} not found`);
  return found;
}

const storedEvaluations = async (topic: string) =>
  (await storedClass(topic)).enrollments.find((e: any) => e.student.name === STUDENT.name).evaluations;

/** Creates the class the first time a step mentions it, with the student enrolled and no rules. */
async function ensureClass(topic: string): Promise<void> {
  currentTopic = topic;
  if (enrolledTopics.has(topic)) {
    return;
  }
  await send('/api/classes', 'POST', { topic, year: YEAR, semester: SEMESTER });
  await send(`${classPath(topic)}/enroll`, 'POST', { studentCPF: STUDENT.cpf });
  enrolledTopics.add(topic);
}

/** Defines the rules of a class through the API, as a professor would have done before. */
async function defineModel(topic: string, model: string, passing?: string, finalExam?: string, weights?: string[]) {
  const value = MODELS[model];
  assert.ok(value, `Unknown model: ${model}`);
  const body: any = { model: value };
  if (value !== 'concepts') {
    body.minimumAverageToPass = Number(passing ?? 7);
    body.minimumAverageForFinalExam = Number(finalExam ?? 3);
  }
  if (value === 'weighted') {
    body.goalWeights = {};
    EVALUATION_GOALS.forEach((goal, index) => { body.goalWeights[goal] = Number(weights ? weights[index] : 1); });
  }
  await send(`${classPath(topic)}/average-calculation-specification`, 'PUT', body);
}

/**
 * Records grades the way the system does: through the API when the class
 * has a model, or straight in the data file when it has none, which is how
 * the classes of previous versions reach the system.
 */
async function recordGrades(topic: string, grades: { goal: string; grade: string }[]): Promise<void> {
  const model = (await storedClass(topic)).averageCalculationSpecification.model;
  if (model) {
    for (const { goal, grade } of grades) {
      const value = model === 'concepts' ? grade : Number(grade);
      await send(`${classPath(topic)}/enrollments/${STUDENT.cpf}/evaluation`, 'PUT', { goal, grade: value });
    }
    return;
  }
  await flushPersistence();
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const classData = data.classes.find((c: any) => c.topic === topic && c.year === YEAR && c.semester === SEMESTER);
  const enrollment = classData.enrollments.find((e: any) => e.studentCPF === STUDENT.cpf);
  for (const { goal, grade } of grades) {
    enrollment.evaluations = enrollment.evaluations.filter((e: any) => e.goal !== goal).concat([{ goal, grade }]);
  }
  writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  await close(apiServer);
  await startApi();
}

/** Opens the evaluations tab with the class selected, and waits for the table. */
async function openEvaluations(topic: string): Promise<void> {
  await page.goto(site);
  await page.waitForSelector('[data-testid="evaluations-tab"]');
  await page.click('[data-testid="evaluations-tab"]');
  await page.waitForSelector('#classSelect');
  await page.waitForFunction(id => Array.from(document.querySelectorAll('#classSelect option'))
    .some(o => (o as HTMLOptionElement).value === id), {}, classId(topic));
  await page.select('#classSelect', classId(topic));
  await page.waitForSelector('[data-testid="average-calculation-settings"]');
  await page.waitForFunction(name => Array.from(document.querySelectorAll('.student-name-cell'))
    .some(cell => cell.textContent === name), {}, STUDENT.name);
}

/** The grades (with - for none) and the average shown in the row of a student. */
const readRow = (student: string) => page.$$eval('.student-row', (rows, args) => {
  const [name, goals] = args as [string, string[]];
  const row = rows.find(r => r.querySelector('.student-name-cell')?.textContent === name);
  if (!row) return null;
  const grades = goals.map(goal => {
    const field = row.querySelector(`[aria-label="${name} — ${goal}"]`) as HTMLInputElement | HTMLSelectElement | null;
    return field && field.value !== '' ? field.value : '-';
  });
  const average = row.querySelector('[data-testid="numeric-average"]')?.textContent ?? null;
  return { grades, average };
}, [student, [...EVALUATION_GOALS]]);

/** Waits for the row to show what is expected, then compares it, so that a failure shows both. */
async function expectRow(student: string, grades: string[], average: string): Promise<void> {
  const expected = { grades, average };
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (JSON.stringify(await readRow(student)) === JSON.stringify(expected)) return;
    await new Promise(done => setTimeout(done, 100));
  }
  assert.deepEqual(await readRow(student), expected);
}

/** Replaces the content of a text field the way a user does. */
async function fill(selector: string, value: string): Promise<void> {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

/** Changes the grade of a goal through its field, waiting for the server to answer. */
async function changeGrade(student: string, goal: string, grade: string): Promise<void> {
  const selector = cellSelector(student, goal);
  const isSelect = await page.$eval(selector, el => el.tagName === 'SELECT');
  const answered = page.waitForResponse(r => r.url().endsWith('/evaluation') && r.request().method() === 'PUT');
  if (isSelect) {
    await page.select(selector, grade);
  } else {
    await fill(selector, grade);
    if (grade === '') {
      await page.keyboard.press('Backspace');
    }
    await page.keyboard.press('Enter');
  }
  await answered;
}

const textOf = (selector: string) => page.$eval(selector, el => el.textContent);

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
  currentTopic = DEFAULT_TOPIC;
  enrolledTopics = new Set();
  selectedModel = undefined;
  specificationBeforeSaving = undefined;
  gradeFieldWasDisabled = false;
  evaluationsBeforeRecording = undefined;
  directory = mkdtempSync(join(tmpdir(), 'ludi-bdd-'));
  dataFile = join(directory, 'app-data.json');
  await startApi();
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await send('/api/students', 'POST', STUDENT);
});

After(async function ({ pickle, result }) {
  try {
    if (page) {
      const screenshot = await page.screenshot({ path: `reports/ludi-${pickle.id}.png`, fullPage: true });
      await this.attach(Buffer.from(screenshot), 'image/png');
      await this.attach(`${pickle.name}: ${result?.status}`, 'text/plain');
    }
  } finally {
    await page?.close();
    await close(apiServer);
    await flushPersistence();
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---------- Classes and their rules ----------

// Arranges a class with no rules before the scenario acts, and checks that it still has none afterwards
Given('o sistema não possui regras de cálculo definidas para a turma {string}', async (topic: string) => {
  if (!actionStarted) {
    await ensureClass(topic);
  }
  assert.equal((await storedClass(topic)).averageCalculationSpecification.model, undefined);
});

Given('a turma {string} está configurada com o modelo de avaliação {string}', async (topic: string, model: string) => {
  await ensureClass(topic);
  await defineModel(topic, model);
});

Given('a turma {string} está configurada com o modelo de avaliação {string}, a nota de corte {string} e a média mínima para a prova final {string}',
  async (topic: string, model: string, passing: string, finalExam: string) => {
    await ensureClass(topic);
    await defineModel(topic, model, passing, finalExam);
  });

Given('a turma {string} está configurada com o modelo de avaliação {string}, a nota de corte {string}, a média mínima para a prova final {string} e os pesos {string}, {string}, {string}, {string}, {string} e {string}',
  // Cucumber checks the number of declared parameters, so they are not gathered with ...rest
  async (topic: string, model: string, passing: string, finalExam: string,
    w1: string, w2: string, w3: string, w4: string, w5: string, w6: string) => {
    await ensureClass(topic);
    await defineModel(topic, model, passing, finalExam, [w1, w2, w3, w4, w5, w6]);
  });

Given('a aluna {string} possui a nota {string} na meta {string} da turma {string}',
  async (student: string, grade: string, goal: string, topic: string) => {
    assert.equal(student, STUDENT.name);
    await ensureClass(topic);
    await recordGrades(topic, [{ goal, grade }]);
  });

Given('a turma {string} não possui notas registradas', async (topic: string) => {
  await ensureClass(topic);
  assert.deepEqual(await storedEvaluations(topic), []);
});

Given('eu acesso o sistema na página de configurações da turma', async () => {
  await openEvaluations(currentTopic);
});

Given('eu acesso o sistema na página de configurações da turma {string}', async (topic: string) => {
  await ensureClass(topic);
  await openEvaluations(topic);
});

// ---------- Configuring the rules through the GUI ----------

When('eu seleciono o modelo de avaliação {string}', async (model: string) => {
  actionStarted = true;
  assert.ok(MODELS[model], `Unknown model: ${model}`);
  selectedModel = MODELS[model];
  await page.select('#averageType', selectedModel);
});

When('defino a média de corte para aprovação como {string}', async (value: string) => {
  actionStarted = true;
  await fill('#passingAverage', value);
});

When('defino a média mínima para a prova final como {string}', async (value: string) => {
  actionStarted = true;
  await fill('#finalExamAverage', value);
});

When('defino os pesos das avaliações como {string}, {string}, {string}, {string}, {string} e {string}',
  async (w1: string, w2: string, w3: string, w4: string, w5: string, w6: string) => {
    actionStarted = true;
    for (const [index, weight] of [w1, w2, w3, w4, w5, w6].entries()) {
      await fill(`#goalWeight-${index}`, weight);
    }
  });

When('confirmo a gravação dos dados', async () => {
  actionStarted = true;
  specificationBeforeSaving = (await storedClass(currentTopic)).averageCalculationSpecification;
  const answered = page.waitForResponse(r =>
    r.url().endsWith('/average-calculation-specification') && r.request().method() === 'PUT');
  await page.click('[data-testid="save-average-calculation"]');
  await answered;
  await page.waitForSelector('[data-testid="average-calculation-settings"] [role="status"], ' + SETTINGS_ERROR);
});

// ---------- What the system stores ----------

async function expectNumericModel(topic: string, passing: string, finalExam: string) {
  const specification = (await storedClass(topic)).averageCalculationSpecification;
  assert.ok(['simple', 'weighted'].includes(specification.model), `Expected a numeric model, got ${specification.model}`);
  if (selectedModel) {
    assert.equal(specification.model, selectedModel);
  }
  assert.equal(specification.minimumAverageToPass, Number(passing));
  assert.equal(specification.minimumAverageForFinalExam, Number(finalExam));
  return specification;
}

Then('o sistema armazena o modelo numérico, a nota de corte {string} e a média mínima para a prova final {string} para a turma {string}',
  async (passing: string, finalExam: string, topic: string) => {
    await expectNumericModel(topic, passing, finalExam);
  });

Then('o sistema armazena o modelo numérico, a nota de corte {string}, a média mínima para a prova final {string} e os pesos {string}, {string}, {string}, {string}, {string} e {string} para a turma {string}',
  async (passing: string, finalExam: string,
    w1: string, w2: string, w3: string, w4: string, w5: string, w6: string, topic: string) => {
    const specification = await expectNumericModel(topic, passing, finalExam);
    assert.equal(specification.model, 'weighted');
    assert.deepEqual(EVALUATION_GOALS.map(goal => specification.goalWeights[goal]), [w1, w2, w3, w4, w5, w6].map(Number));
  });

Then('o sistema armazena o modelo qualitativo para a turma {string}', async (topic: string) => {
  const specification = (await storedClass(topic)).averageCalculationSpecification;
  assert.equal(specification.model, 'concepts');
  assert.equal(specification.minimumAverageToPass, null);
});

Then('o sistema mantém o modelo {string} para a turma {string}', async (model: string, topic: string) => {
  assert.equal((await storedClass(topic)).averageCalculationSpecification.model, MODELS[model]);
});

Then('o sistema recusa o armazenamento', async () => {
  assert.deepEqual((await storedClass(currentTopic)).averageCalculationSpecification, specificationBeforeSaving);
  assert.equal(await page.$('[data-testid="average-calculation-settings"] [role="status"]'), null);
});

Then('oculta o campo de média de corte numérica', async () => {
  assert.equal(await page.$('#passingAverage'), null);
  assert.equal(await page.$('#finalExamAverage'), null);
});

Then('retorna uma mensagem de confirmação da configuração', async () => {
  assert.equal(await textOf('[data-testid="average-calculation-settings"] [role="status"]'), 'Average calculation saved.');
});

Then(/^exibe uma mensagem de erro informando que (.+)$/, async (description: string) => {
  const error = ERRORS[description];
  assert.ok(error, `No message is known for: ${description}`);
  await page.waitForSelector(error.selector);
  assert.equal(await textOf(error.selector), error.text);
});

// ---------- Recording grades ----------

Given('estou na página {string}', async (name: string) => {
  assert.equal(name, 'Registro de Notas');
  await ensureClass(currentTopic);
  await openEvaluations(currentTopic);
});

Given('a opção {string} está selecionada', async (model: string) => {
  await defineModel(currentTopic, model);
  await openEvaluations(currentTopic);
  assert.equal(await page.$eval('#averageType', el => (el as HTMLSelectElement).value), MODELS[model]);
});

Given('nenhum modelo de avaliação está definido para a turma', async () => {
  assert.equal((await storedClass(currentTopic)).averageCalculationSpecification.model, undefined);
  assert.equal(await page.$eval('#averageType', el => (el as HTMLSelectElement).value), '');
});

// Arranges the grades before the scenario acts; every occurrence checks what the GUI shows
Given('na linha da aluna {string} vejo as notas {string},{string},{string}, {string}, {string}, {string} e média {string}',
  async (student: string, g1: string, g2: string, g3: string, g4: string, g5: string, g6: string, average: string) => {
    assert.equal(student, STUDENT.name);
    const grades = [g1, g2, g3, g4, g5, g6];
    if (!actionStarted) {
      const toRecord = EVALUATION_GOALS
        .map((goal, index) => ({ goal, grade: grades[index] }))
        .filter(({ grade }) => grade !== '-');
      if (toRecord.length > 0) {
        await recordGrades(currentTopic, toRecord);
        await openEvaluations(currentTopic);
      }
    }
    await expectRow(student, grades, average);
  });

When('registro a nota {string} na última nota', async (grade: string) => {
  actionStarted = true;
  evaluationsBeforeRecording = await storedEvaluations(currentTopic);
  const selector = cellSelector(STUDENT.name, LAST_GOAL);
  gradeFieldWasDisabled = await page.$eval(selector, el => (el as HTMLInputElement).disabled);
  if (!gradeFieldWasDisabled) {
    await changeGrade(STUDENT.name, LAST_GOAL, grade);
  }
});

When('apago a última nota', async () => {
  actionStarted = true;
  await changeGrade(STUDENT.name, LAST_GOAL, '');
});

Then('o sistema recusa o registro da nota', async () => {
  assert.deepEqual(await storedEvaluations(currentTopic), evaluationsBeforeRecording);
  if (!gradeFieldWasDisabled) {
    await page.waitForSelector('[data-testid="grade-feedback"][role="alert"]');
  }
});

Then('retorna a mensagem de que a nota da aluna {string} foi alterada com sucesso', async (student: string) => {
  await page.waitForSelector('[data-testid="grade-feedback"][role="status"]');
  assert.equal(await textOf('[data-testid="grade-feedback"]'), `The grade of ${student} was updated successfully.`);
});
