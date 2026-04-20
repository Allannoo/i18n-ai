import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { logger } from '../utils/logger';
import { createProgress } from '../utils/progress';
import { exportToJson } from '../core/exporter/json';
import { exportToArb } from '../core/exporter/arb';
import { exportToXml } from '../core/exporter/xml';
import { exportToStrings } from '../core/exporter/strings';

interface ExportOptions {
  format?: string;
  out?: string;
}

export const exportCommand = new Command('export')
  .description('Export translations to a specific format')
  .option('-f, --format <format>', 'output format: json, arb, xml, strings')
  .option('-o, --out <path>', 'output directory path')
  .action(async (options: ExportOptions) => {
    const progress = createProgress('Exporting translations...');
    
    try {
      const config = loadConfig();
      const sourceLang = config.sourceLang;
      const localesDir = path.join(process.cwd(), config.localesDir);
      const outDir = options.out || localesDir;

      // Ensure output directory exists
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const format = options.format || 'json';
      const exportedFiles: string[] = [];

      // Export each language
      for (const lang of [sourceLang, ...config.targetLangs]) {
        // Search for source file: new pattern first, then old
        const outputFilename = (config as any).outputFilename || 'translations';
        const candidates = [
          path.join(localesDir, `${outputFilename}_${lang}.json`),
          path.join(localesDir, `${lang}.json`),
        ];
        
        let sourceFile = '';
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            sourceFile = c;
            break;
          }
        }
        
        if (!sourceFile) {
          progress.update(`Skipping ${lang} - file not found`);
          continue;
        }

        const content = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
        let outputPath: string;

        switch (format) {
          case 'json':
            outputPath = path.join(outDir, `${lang}.json`);
            fs.writeFileSync(outputPath, exportToJson(content));
            break;

          case 'arb':
            outputPath = path.join(outDir, `app_${lang}.arb`);
            fs.writeFileSync(outputPath, exportToArb(content, lang));
            break;

          case 'xml':
            outputPath = path.join(outDir, `values-${lang}/strings.xml`);
            const xmlDir = path.dirname(outputPath);
            if (!fs.existsSync(xmlDir)) {
              fs.mkdirSync(xmlDir, { recursive: true });
            }
            fs.writeFileSync(outputPath, exportToXml(content, lang));
            break;

          case 'strings':
            outputPath = path.join(outDir, `${lang}.lproj/Localizable.strings`);
            const stringsDir = path.dirname(outputPath);
            if (!fs.existsSync(stringsDir)) {
              fs.mkdirSync(stringsDir, { recursive: true });
            }
            fs.writeFileSync(outputPath, exportToStrings(content, lang));
            break;

          default:
            throw new Error(`Unknown format: ${format}. Use: json, arb, xml, strings`);
        }

        exportedFiles.push(outputPath);
      }

      progress.succeed('Export completed');
      
      logger.section('Exported Files');
      exportedFiles.forEach(file => {
        logger.success(file);
      });

    } catch (error) {
      progress.fail('Export failed');
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });
