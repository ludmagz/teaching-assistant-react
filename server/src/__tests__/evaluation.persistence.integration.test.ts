import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { createApp } from '../app';
import { StudentSet } from '../models/StudentSet';
import { Classes } from '../models/Classes';
import { JsonFileRepository } from '../persistence/JsonFileRepository';

describe('HTTP → domain → JSON file → fresh application integration', () => {
  let directory: string;

  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'fernando-integration-')); });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  test('a grade registered through HTTP survives reconstruction and can be removed after reload', async () => {
    const file = join(directory, 'app-data.json');
    const freshApplication = () => {
      const repository = new JsonFileRepository(file);
      const students = new StudentSet();
      const classes = new Classes();
      repository.load(students, classes);
      return createApp({ students, classes, repository });
    };
    // Persistence is scheduled with setImmediate by createApp. Yield to that
    // queue before inspecting the actual file; no arbitrary time delay.
    const flushPersistence = () => new Promise<void>(resolve => setImmediate(resolve));
    let app = freshApplication();
    const student = { name: 'Marina', cpf: '123.456.789-01', email: 'marina@example.com' };
    await request(app).post('/api/students').send(student).expect(201);
    const created = await request(app).post('/api/classes')
      .send({ topic: 'ESS', year: 2026, semester: 1 }).expect(201);
    const classPath = `/api/classes/${encodeURIComponent(created.body.id)}`;
    await request(app).post(`${classPath}/enroll`).send({ studentCPF: student.cpf }).expect(201);
    const evaluationPath = `${classPath}/enrollments/${student.cpf}/evaluation`;
    await request(app).put(evaluationPath).send({ goal: 'Tests', grade: 'MA' }).expect(200);
    const expectedGrades = [{ goal: 'Tests', grade: 'MA' }];
    await flushPersistence();
    expect(JSON.parse(readFileSync(file, 'utf8')).classes[0].enrollments[0].evaluations)
      .toEqual(expectedGrades);

    // All collections and the repository are new: this cannot pass by reading
    // state left in memory in the first application.
    app = freshApplication();
    const reloaded = await request(app).get(`${classPath}/enrollments`).expect(200);
    expect(reloaded.body[0].student).toEqual(student);
    expect(reloaded.body[0].evaluations).toEqual(expectedGrades);
    await request(app).put(evaluationPath).send({ goal: 'Tests', grade: 'A' }).expect(400);
    const unchanged = await request(app).get(`${classPath}/enrollments`).expect(200);
    expect(unchanged.body[0].evaluations).toEqual(expectedGrades);
    await request(app).put(evaluationPath).send({ goal: 'Tests', grade: '' }).expect(200);
    await flushPersistence();
    app = freshApplication();
    const cleared = await request(app).get(`${classPath}/enrollments`).expect(200);
    expect(cleared.body[0].evaluations).toEqual([]);
    expect(cleared.body[0].averageBeforeFinalExam).toBeNull();
    await flushPersistence();
  });
});
