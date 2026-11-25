// The step definitions are TypeScript, compiled on the fly by ts-node. They
// must be compiled with tsconfig.test.json: it emits CommonJS, whereas the
// application's tsconfig.json emits ES modules, whose resolution does not
// know the .ts extension and so cannot import the project's own modules.
process.env.TS_NODE_PROJECT = process.env.TS_NODE_PROJECT || 'tsconfig.test.json';

module.exports = {
  fernando: {
    require: ['acceptance/fernando.steps.ts'],
    requireModule: ['ts-node/register'],
    paths: ['src/features/fernando-calculo-media.feature', 'src/features/fernando-color-coding.feature'],
    format: ['progress', 'json:reports/fernando.json', 'html:reports/fernando.html']
  },
  ludi: {
    require: ['acceptance/ludi.steps.ts'],
    requireModule: ['ts-node/register'],
    paths: ['src/features/ludi-definicao-calculo-media.feature'],
    format: ['progress', 'json:reports/ludi.json', 'html:reports/ludi.html']
  },
  default: {
    require: [
      'ts-node/register',
      'src/step-definitions/**/*.ts'
    ],
    format: [
      'progress-bar',
      'json:reports/cucumber_report.json',
      'html:reports/cucumber_report.html'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    paths: ['src/features/**/*.feature'],
    requireModule: ['ts-node/register']
  }
};
