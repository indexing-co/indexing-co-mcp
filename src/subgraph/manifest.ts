export interface SubgraphContract {
  dataSource: string;
  kind: string;
  network: string | null;
  address: string | null;
  sourceAbi: string | null;
  startBlock: number | null;
  entities: string[];
  abiNames: string[];
}

export interface SubgraphEvent {
  dataSource: string;
  handler: string;
  signature: string;
  normalizedSignature: string;
  eventName: string;
  topicSignature: string;
  contractAddress: string | null;
  network: string | null;
}

export interface SubgraphParseResult {
  manifest: {
    specVersion: string | null;
    description: string | null;
    repository: string | null;
    schemaFile: string | null;
    features: string[];
    networks: string[];
    dataSourceCount: number;
    templateCount: number;
  };
  contracts: SubgraphContract[];
  events: SubgraphEvent[];
  transformationSuggestions: {
    pipelineName: string;
    filterName: string;
    filterValues: string[];
    transformationName: string;
    networks: string[];
    eventSignatures: string[];
    code: string;
    notes: string[];
  };
  sqlSchemaScaffold: {
    tableName: string;
    ddl: string;
    columns: Array<{ name: string; type: string; source: string }>;
  };
}

interface ManifestDataSource {
  kind?: unknown;
  name?: unknown;
  network?: unknown;
  source?: {
    address?: unknown;
    abi?: unknown;
    startBlock?: unknown;
  };
  mapping?: {
    entities?: unknown;
    abis?: unknown;
    eventHandlers?: unknown;
  };
}

interface ManifestDocument {
  specVersion?: unknown;
  description?: unknown;
  repository?: unknown;
  features?: unknown;
  schema?: {
    file?: unknown;
  };
  dataSources?: unknown;
  templates?: unknown;
}

export function parseSubgraphManifest(input: string): SubgraphParseResult {
  const manifest = parseManifestDocument(input);
  const dataSources = Array.isArray(manifest.dataSources) ? manifest.dataSources as ManifestDataSource[] : [];
  const templates = Array.isArray(manifest.templates) ? manifest.templates : [];

  const contracts = dataSources.map((source) => {
    const mapping = asObject(source.mapping);
    const sourceMeta = asObject(source.source);

    return {
      dataSource: asString(source.name) ?? 'unnamed_data_source',
      kind: asString(source.kind) ?? 'unknown',
      network: asString(source.network) ?? null,
      address: normalizeAddress(asString(sourceMeta.address)),
      sourceAbi: asString(sourceMeta.abi) ?? null,
      startBlock: asNumber(sourceMeta.startBlock),
      entities: asStringArray(mapping.entities),
      abiNames: asAbiNames(mapping.abis),
    };
  });

  const events = dataSources.flatMap((source) => {
    const mapping = asObject(source.mapping);
    const handlers = Array.isArray(mapping.eventHandlers) ? mapping.eventHandlers : [];
    const dataSource = asString(source.name) ?? 'unnamed_data_source';
    const contractAddress = normalizeAddress(asString(asObject(source.source).address));
    const network = asString(source.network) ?? null;

    return handlers
      .map((handler) => asObject(handler))
      .filter((handler) => typeof handler.event === 'string' && typeof handler.handler === 'string')
      .map((handler) => {
        const signature = String(handler.event);
        const parsed = parseEventSignature(signature);
        return {
          dataSource,
          handler: String(handler.handler),
          signature,
          normalizedSignature: parsed.normalizedSignature,
          eventName: parsed.eventName,
          topicSignature: parsed.topicSignature,
          contractAddress,
          network,
        };
      });
  });

  const networks = unique(
    contracts
      .map((contract) => contract.network)
      .filter((network): network is string => Boolean(network))
  );
  const filterValues = unique(
    contracts
      .map((contract) => contract.address)
      .filter((address): address is string => Boolean(address))
  );
  const pipelineName = slugify(
    contracts[0]?.dataSource || events[0]?.eventName || asString(manifest.description) || 'subgraph-migration'
  );
  const transformationName = `${pipelineName}_transform`;
  const filterName = `${pipelineName}_contracts`;
  const eventSignatures = unique(events.map((event) => event.normalizedSignature));

  const notes: string[] = [];
  if (filterValues.length === 0) {
    notes.push('No contract addresses were found in the manifest. You may need to provide filter values manually.');
  }
  if (eventSignatures.length === 0) {
    notes.push('No event handlers were found. This manifest may rely on call handlers or block handlers, which need manual transformation logic.');
  }
  if (events.length !== eventSignatures.length) {
    notes.push('Some event signatures are reused across multiple data sources. Keep contract address in the output to disambiguate them.');
  }

  return {
    manifest: {
      specVersion: asString(manifest.specVersion) ?? null,
      description: asString(manifest.description) ?? null,
      repository: asString(manifest.repository) ?? null,
      schemaFile: asString(asObject(manifest.schema).file) ?? null,
      features: asStringArray(manifest.features),
      networks,
      dataSourceCount: dataSources.length,
      templateCount: templates.length,
    },
    contracts,
    events,
    transformationSuggestions: {
      pipelineName,
      filterName,
      filterValues,
      transformationName,
      networks,
      eventSignatures,
      code: buildTransformationCode(eventSignatures),
      notes,
    },
    sqlSchemaScaffold: buildSqlSchemaScaffold(pipelineName, events),
  };
}

function parseManifestDocument(input: string): ManifestDocument {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Manifest text is empty.');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as ManifestDocument;
  }

  const parsed = parseYaml(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Manifest root must be an object.');
  }
  return parsed as ManifestDocument;
}

function buildTransformationCode(eventSignatures: string[]): string {
  const signatures = eventSignatures.length > 0
    ? eventSignatures.map((signature) => `    '${signature}'`).join(',\n')
    : "    'event Transfer(address indexed arg0, address indexed arg1, uint256 arg2)'";

  return [
    'function transform(block) {',
    '  const results = [];',
    '  const signatures = [',
    signatures,
    '  ];',
    '',
    '  for (const tx of block.transactions || []) {',
    '    for (const log of tx.receipt?.logs || []) {',
    '      const decoded = utils.evmDecodeLogWithMetadata(log, signatures);',
    '      if (!decoded) continue;',
    '',
    '      results.push({',
    '        chain: block._network,',
    '        block_number: Number(block.number),',
    '        block_timestamp: utils.blockToTimestamp(block),',
    '        transaction_hash: tx.hash,',
    '        log_index: log.logIndex,',
    '        contract_address: log.address?.toLowerCase(),',
    '        event_name: decoded.eventName,',
    '        decoded: decoded.decoded,',
    '      });',
    '    }',
    '  }',
    '',
    '  return results;',
    '}',
  ].join('\n');
}

function buildSqlSchemaScaffold(pipelineName: string, events: SubgraphEvent[]) {
  const tableName = `${pipelineName}_events`;
  const dynamicColumns = dedupeColumns(events.flatMap((event) => {
    const parsed = parseEventSignature(event.signature);
    return parsed.parameters.map((parameter) => ({
      name: `${event.eventName}_${parameter.name}`.toLowerCase(),
      type: sqlTypeForEvmType(parameter.type),
      source: `${event.eventName}.${parameter.name}`,
    }));
  }));

  const columns = [
    { name: 'chain', type: 'TEXT NOT NULL', source: 'block._network' },
    { name: 'block_number', type: 'BIGINT NOT NULL', source: 'block.number' },
    { name: 'block_timestamp', type: 'TIMESTAMPTZ NOT NULL', source: 'utils.blockToTimestamp(block)' },
    { name: 'transaction_hash', type: 'TEXT NOT NULL', source: 'tx.hash' },
    { name: 'log_index', type: 'INTEGER NOT NULL', source: 'log.logIndex' },
    { name: 'contract_address', type: 'TEXT NOT NULL', source: 'log.address' },
    { name: 'event_name', type: 'TEXT NOT NULL', source: 'decoded.eventName' },
    ...dynamicColumns,
    { name: 'decoded', type: 'JSONB NOT NULL', source: 'decoded.decoded' },
    { name: 'created_at', type: 'TIMESTAMPTZ NOT NULL DEFAULT now()', source: 'delivery timestamp' },
  ];

  const ddl = [
    `CREATE TABLE ${tableName} (`,
    ...columns.map((column) => `  ${column.name} ${column.type},`),
    '  PRIMARY KEY (chain, transaction_hash, log_index)',
    ');',
  ].join('\n');

  return { tableName, ddl, columns };
}

function sqlTypeForEvmType(type: string): string {
  if (type.endsWith('[]')) return 'JSONB';
  if (type === 'address' || type === 'bytes' || type.startsWith('bytes')) return 'TEXT';
  if (type === 'string') return 'TEXT';
  if (type === 'bool') return 'BOOLEAN';
  if (type.startsWith('uint') || type.startsWith('int')) return 'NUMERIC';
  if (type.startsWith('tuple')) return 'JSONB';
  return 'TEXT';
}

function parseEventSignature(signature: string) {
  const trimmed = signature.trim();
  const start = trimmed.indexOf('(');
  const end = trimmed.lastIndexOf(')');
  if (start === -1 || end === -1 || end < start) {
    return {
      eventName: trimmed,
      topicSignature: trimmed,
      normalizedSignature: `event ${trimmed}`,
      parameters: [] as Array<{ name: string; type: string; indexed: boolean }>,
    };
  }

  const eventName = trimmed.slice(0, start).trim();
  const inner = trimmed.slice(start + 1, end).trim();
  const parts = inner ? splitCommaAware(inner) : [];
  const parameters = parts.map((part, index) => {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const indexed = tokens.includes('indexed');
    const type = tokens.find((token) => token !== 'indexed') ?? 'bytes';
    return {
      name: `arg${index}`,
      type,
      indexed,
    };
  });

  const topicSignature = `${eventName}(${parameters.map((parameter) => parameter.type).join(',')})`;
  const normalizedSignature = `event ${eventName}(${parameters.map((parameter) => `${parameter.type}${parameter.indexed ? ' indexed' : ''} ${parameter.name}`).join(', ')})`;

  return { eventName, topicSignature, normalizedSignature, parameters };
}

function parseYaml(input: string): unknown {
  const lines = input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => raw.replace(/\t/g, '  '))
    .map((raw) => stripYamlComment(raw));

  let index = 0;

  function skipBlank() {
    while (index < lines.length && lines[index].trim() === '') {
      index += 1;
    }
  }

  function parseNode(indent: number): unknown {
    skipBlank();
    if (index >= lines.length) return null;
    const line = lines[index];
    const currentIndent = countIndent(line);
    if (currentIndent < indent) return null;
    if (line.trimStart().startsWith('- ')) {
      return parseSequence(indent);
    }
    return parseMapping(indent);
  }

  function parseSequence(indent: number): unknown[] {
    const items: unknown[] = [];

    while (index < lines.length) {
      skipBlank();
      if (index >= lines.length) break;

      const line = lines[index];
      const currentIndent = countIndent(line);
      if (currentIndent < indent) break;
      if (currentIndent !== indent || !line.trimStart().startsWith('- ')) break;

      const rest = line.slice(currentIndent + 2).trim();
      index += 1;

      if (!rest) {
        items.push(parseNode(indent + 2));
        continue;
      }

      const pair = parseKeyValue(rest);
      if (pair) {
        const item: Record<string, unknown> = {};
        if (pair.value === '') {
          item[pair.key] = parseNode(indent + 2);
        } else {
          item[pair.key] = parseScalar(pair.value);
        }
        parseMappingEntries(indent + 2, item);
        items.push(item);
        continue;
      }

      items.push(parseScalar(rest));
    }

    return items;
  }

  function parseMapping(indent: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    parseMappingEntries(indent, result);
    return result;
  }

  function parseMappingEntries(indent: number, target: Record<string, unknown>) {
    while (index < lines.length) {
      skipBlank();
      if (index >= lines.length) break;

      const line = lines[index];
      const currentIndent = countIndent(line);
      if (currentIndent < indent) break;
      if (currentIndent > indent) {
        throw new Error(`Invalid indentation near: ${line.trim()}`);
      }
      if (line.trimStart().startsWith('- ')) break;

      const trimmed = line.trim();
      const pair = parseKeyValue(trimmed);
      if (!pair) {
        throw new Error(`Invalid YAML line: ${trimmed}`);
      }

      index += 1;
      if (pair.value === '') {
        target[pair.key] = parseNode(indent + 2);
      } else {
        target[pair.key] = parseScalar(pair.value);
      }
    }
  }

  const value = parseNode(0);
  skipBlank();
  if (index < lines.length) {
    throw new Error(`Unexpected YAML content near: ${lines[index].trim()}`);
  }
  return value;
}

function parseKeyValue(input: string): { key: string; value: string } | null {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;
    if (char === ':' && !inSingle && !inDouble) {
      return {
        key: input.slice(0, i).trim(),
        value: input.slice(i + 1).trim(),
      };
    }
  }

  return null;
}

function parseScalar(value: string): unknown {
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitCommaAware(inner).map((part) => parseScalar(part.trim()));
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return {};
    const result: Record<string, unknown> = {};
    for (const entry of splitCommaAware(inner)) {
      const pair = parseKeyValue(entry.trim());
      if (pair) {
        result[pair.key] = parseScalar(pair.value);
      }
    }
    return result;
  }

  return value;
}

function splitCommaAware(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inSingle = false;
  let inDouble = false;

  for (const char of input) {
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble) {
      if (char === '(') depthParen += 1;
      if (char === ')') depthParen -= 1;
      if (char === '[') depthBracket += 1;
      if (char === ']') depthBracket -= 1;
      if (char === '{') depthBrace += 1;
      if (char === '}') depthBrace -= 1;
      if (char === ',' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
        result.push(current);
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current) result.push(current);
  return result;
}

function stripYamlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;
    if (char === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i).replace(/\s+$/, '');
      }
    }
  }

  return line;
}

function countIndent(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === ' ') count += 1;
  return count;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asAbiNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asObject(item).name)
    .filter((item): item is string => typeof item === 'string');
}

function normalizeAddress(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'subgraph_migration';
}

function isColumnDescriptor(value: unknown): value is { name: string; type: string; source: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { source?: unknown }).source === 'string'
  );
}

function dedupeColumns(columns: Array<{ name: string; type: string; source: string }>) {
  const seen = new Set<string>();
  const result: Array<{ name: string; type: string; source: string }> = [];

  for (const column of columns) {
    if (!isColumnDescriptor(column) || seen.has(column.name)) continue;
    seen.add(column.name);
    result.push(column);
  }

  return result;
}
