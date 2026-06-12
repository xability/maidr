#!/usr/bin/env node
/**
 * Checks the curated LLM model catalog (src/service/modelVersions.ts) against
 * each provider's live models API and reports drift:
 *   - catalog entries the provider no longer serves (stale -> exit code 1)
 *   - newly available models not yet in the catalog (informational)
 *
 * Run manually with `npm run check-models`, or on a schedule in CI
 * (.github/workflows/model-catalog-check.yml). Providers whose API key is not
 * present in the environment are skipped:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
 *
 * The chat-capability filters are shared with LlmValidationService via
 * src/service/modelFilters.json, so runtime probing and this check can never
 * diverge.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SERVICE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'service');
const CATALOG_PATH = join(SERVICE_DIR, 'modelVersions.ts');

const modelFilters = JSON.parse(readFileSync(join(SERVICE_DIR, 'modelFilters.json'), 'utf8'));
const OPENAI_CHAT_MODEL_PATTERN = new RegExp(modelFilters.openai.chatModelPattern);
const OPENAI_NON_CHAT_SUBSTRINGS = modelFilters.openai.nonChatSubstrings;
const GEMINI_EXCLUDED_SUBSTRINGS = modelFilters.gemini.excludedSubstrings;

/**
 * Extracts the curated options array for one provider from the catalog
 * source. Source-text parsing is inherently format-sensitive, so the result
 * is sanity-checked against the provider's default: if the parse drifts from
 * the file's actual shape, this throws instead of reporting bogus drift.
 */
function readCatalogOptions(source, provider) {
  const blockMatch = source.match(new RegExp(`${provider}:\\s*\\{([\\s\\S]*?)options:\\s*\\[([^\\]]*)\\]`));
  if (!blockMatch) {
    throw new Error(`Could not locate options for ${provider} in ${CATALOG_PATH}`);
  }
  const options = [...blockMatch[2].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const defaultMatch = blockMatch[1].match(/default:\s*'([^']+)'/);
  if (options.length === 0 || !defaultMatch || !options.includes(defaultMatch[1])) {
    throw new Error(
      `Parsed catalog for ${provider} failed sanity checks (options: [${options.join(', ')}], `
      + `default: ${defaultMatch?.[1] ?? 'not found'}) — the parser in this script likely needs `
      + `updating for a formatting change in ${CATALOG_PATH}`,
    );
  }
  return options;
}

async function fetchOpenAiModels(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenAI models request failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.data ?? [])
    .map(model => model.id)
    .filter(id =>
      OPENAI_CHAT_MODEL_PATTERN.test(id)
      && !OPENAI_NON_CHAT_SUBSTRINGS.some(substring => id.includes(substring)),
    );
}

async function fetchAnthropicModels(apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!response.ok) {
    throw new Error(`Anthropic models request failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.data ?? []).map(model => model.id);
}

async function fetchGeminiModels(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
  );
  if (!response.ok) {
    throw new Error(`Gemini models request failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.models ?? [])
    .filter(model =>
      model.supportedGenerationMethods?.includes('generateContent')
      && !GEMINI_EXCLUDED_SUBSTRINGS.some(substring => model.name.includes(substring)),
    )
    .map(model => model.name.replace(/^models\//, ''));
}

const PROVIDERS = [
  { key: 'OPENAI', envVar: 'OPENAI_API_KEY', fetchModels: fetchOpenAiModels },
  { key: 'ANTHROPIC_CLAUDE', envVar: 'ANTHROPIC_API_KEY', fetchModels: fetchAnthropicModels },
  { key: 'GOOGLE_GEMINI', envVar: 'GEMINI_API_KEY', fetchModels: fetchGeminiModels },
];

async function main() {
  const source = readFileSync(CATALOG_PATH, 'utf8');
  let driftFound = false;
  let checkedAny = false;

  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.envVar];
    if (!apiKey) {
      console.log(`SKIP ${provider.key}: ${provider.envVar} not set`);
      continue;
    }
    checkedAny = true;

    const catalog = readCatalogOptions(source, provider.key);
    let live;
    try {
      live = await provider.fetchModels(apiKey);
    } catch (error) {
      console.error(`ERROR ${provider.key}: ${error.message}`);
      driftFound = true;
      continue;
    }

    const liveSet = new Set(live);
    const stale = catalog.filter(model => !liveSet.has(model));
    const missing = live.filter(model => !catalog.includes(model));

    console.log(`\n## ${provider.key}`);
    console.log(`Catalog: ${catalog.join(', ')}`);
    if (stale.length > 0) {
      driftFound = true;
      console.log(`STALE (no longer served — update src/service/modelVersions.ts and src/type/llm.ts): ${stale.join(', ')}`);
    } else {
      console.log('All catalog entries are still served.');
    }
    if (missing.length > 0) {
      // Providers can serve dozens of models; keep the report readable.
      const MAX_LISTED = 15;
      const shown = missing.slice(0, MAX_LISTED).join(', ');
      const more = missing.length > MAX_LISTED ? ` (+${missing.length - MAX_LISTED} more)` : '';
      console.log(`Not in catalog (consider curating): ${shown}${more}`);
    }
  }

  if (!checkedAny) {
    console.log('\nNo provider API keys configured; nothing was checked.');
    return;
  }
  if (driftFound) {
    console.error('\nModel catalog drift detected.');
    process.exitCode = 1;
  } else {
    console.log('\nModel catalog is up to date for all checked providers.');
  }
}

await main();
