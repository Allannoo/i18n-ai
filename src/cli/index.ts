#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { initCommand } from './init';
import { scanCommand } from './scan';
import { translateCommand } from './translate';
import { checkCommand } from './check';
import { statusCommand } from './status';
import { exportCommand } from './export';

const program = new Command();

program
  .name('i18n-ai')
  .description('AI-powered localization CLI for Flutter, React, Vue, Android & iOS')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(translateCommand);
program.addCommand(checkCommand);
program.addCommand(statusCommand);
program.addCommand(exportCommand);

program.parse(process.argv);
