import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';

const LANGUAGE_CHOICES = [
  { name: 'English (en)', value: 'en' },
  { name: 'Russian (ru)', value: 'ru' },
  { name: 'German (de)', value: 'de' },
  { name: 'Chinese (zh)', value: 'zh' },
  { name: 'Japanese (ja)', value: 'ja' },
  { name: 'French (fr)', value: 'fr' },
  { name: 'Spanish (es)', value: 'es' },
  { name: 'Portuguese (pt)', value: 'pt' },
  { name: 'Italian (it)', value: 'it' },
  { name: 'Korean (ko)', value: 'ko' },
  { name: 'Arabic (ar)', value: 'ar' },
  { name: 'Hindi (hi)', value: 'hi' },
  { name: 'Turkish (tr)', value: 'tr' },
  { name: 'Polish (pl)', value: 'pl' },
  { name: 'Dutch (nl)', value: 'nl' },
  { name: 'Ukrainian (uk)', value: 'uk' },
];

interface InitAnswers {
  framework: string;
  sourceLang: string;
  targetLangs: string[];
  provider: string;
  outputFilename: string;
}

export const initCommand = new Command('init')
  .description('Initialize in a project')
  .action(async () => {
    console.log('Initializing i18n-ai in your project...\n');

    const answers = await inquirer.prompt<InitAnswers>([
      {
        type: 'list',
        name: 'framework',
        message: 'Which framework are you using?',
        choices: [
          { name: 'Flutter', value: 'flutter' },
          { name: 'React/Next.js', value: 'react' },
          { name: 'Vue/Nuxt', value: 'vue' },
          { name: 'Android', value: 'android' },
          { name: 'iOS/macOS', value: 'ios' },
          { name: 'React Native', value: 'react-native' }
        ],
        default: 'react'
      },
      {
        type: 'list',
        name: 'sourceLang',
        message: 'What is the SOURCE language of your project?',
        choices: LANGUAGE_CHOICES,
        default: 'en'
      },
      {
        type: 'checkbox',
        name: 'targetLangs',
        message: 'Which languages to translate TO? (Select multiple)',
        choices: (prev: any) => {
          return LANGUAGE_CHOICES.filter(lang => lang.value !== prev.sourceLang);
        },
        validate: (input: string[]) => {
          if (input.length === 0) {
            return 'Please select at least one target language';
          }
          return true;
        }
      },
      {
        type: 'list',
        name: 'provider',
        message: 'Which AI provider to use?',
        choices: [
          { 
            name: 'OpenRouter (GPT-oss, Llama, Qwen - Free tier)', 
            value: 'openrouter' 
          },
          { 
            name: 'OpenAI (Requires API key)', 
            value: 'openai' 
          },
          { 
            name: 'Anthropic (Requires API key)', 
            value: 'anthropic' 
          }
        ],
        default: 'openrouter'
      },
      {
        type: 'input',
        name: 'outputFilename',
        message: 'Name for translation files (without extension)?',
        default: 'translations',
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Filename cannot be empty';
          }
          if (/[<>:"/\\|?*]/.test(input)) {
            return 'Filename contains invalid characters';
          }
          return true;
        }
      }
    ]);

    // Determine default model based on provider
    let defaultModel: string;
    switch (answers.provider) {
      case 'openrouter':
        defaultModel = 'openai/gpt-oss-120b:free';
        break;
      case 'openai':
        defaultModel = 'gpt-4o-mini';
        break;
      case 'anthropic':
        defaultModel = 'claude-haiku-20240307';
        break;
      default:
        defaultModel = 'openai/gpt-oss-120b:free';
    }

    // Create .i18n-ai directory
    const i18nDir = path.join(process.cwd(), '.i18n-ai');
    if (!fs.existsSync(i18nDir)) {
      fs.mkdirSync(i18nDir, { recursive: true });
    }

    // Create config file
    const config = {
      framework: answers.framework,
      sourceLang: answers.sourceLang,
      targetLangs: answers.targetLangs,
      localesDir: './.i18n-ai',
      provider: answers.provider,
      model: defaultModel,
      outputFilename: answers.outputFilename,
      contextRules: {
        button: 'Translate as verb-command, short',
        error: 'Translate as problem description',
        title: 'Translate with capital letter'
      },
      ignore: ['node_modules', '.git', 'build', 'dist', '.i18n-ai'],
      supportEmail: '92_92alan@mail.ru'
    };

    const configPath = path.join(process.cwd(), 'i18n.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Get API key env var name
    const envVarName = getEnvVarName(answers.provider);

    console.log('\n✅ Configuration created successfully!');
    console.log(`📄 Config saved to: ${configPath}`);
    console.log(`📁 Working directory: ${i18nDir}`);
    console.log(`📝 Output files: ${answers.outputFilename}_<lang>.json`);
    console.log('\n📝 Next steps:');
    console.log(`   1. Set your API key: export ${envVarName}=your-key`);
    console.log(`      Or add to .env file: ${envVarName}=your-key`);
    console.log(`   2. Run: i18n-ai scan`);
    console.log(`   3. Run: i18n-ai translate --lang ${answers.targetLangs.join(',')}`);
  });

function getEnvVarName(provider: string): string {
  switch (provider) {
    case 'openrouter': return 'OPENROUTER_API_KEY';
    case 'openai': return 'OPENAI_API_KEY';
    case 'anthropic': return 'ANTHROPIC_API_KEY';
    default: return 'OPENROUTER_API_KEY';
  }
}
