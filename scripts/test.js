'use strict';

process.env.NODE_ENV = 'test';
process.env.PUBLIC_URL = '';

const jest = require('jest');
const argv = process.argv.slice(2);

// Watch unless on CI or in coverage mode
if (!process.env.CI && !process.env.LOCAL_DEPLOY && argv.indexOf('--coverage') < 0) {
  argv.push('--watch');
}


jest.run(argv);
