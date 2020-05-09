const sugar = require('sugar');
const path = require('path');
const fs = require('fs');
const prettier = require('prettier');
const prettierOptions = require(path.join(process.cwd(), './.prettierrc.js'));
const dtsGenerator = require('dtsgenerator').default;
const { createTypeNameConverter } = require('./createTypeNameConverter');
const { compile } = require('./compile');
const { createRealmSchemas } = require('./createRealmSchemas');
const { loadOpenApi } = require('./loadOpenApi');
const { log } = require('../common/log');
const { groupBy, find, first } = sugar.Array;
const { camelize, capitalize } = sugar.String;

function p(...args) {
  return path.join(process.cwd(), ...args);
}

function writeOutput(folder, name, content, logName) {
  log(logName).save.start();
  const prettified = prettier.format(content, {
    ...prettierOptions,
    parser: 'typescript',
  });
  fs.writeFileSync(p(folder, name), prettified);
  log(logName).save.done();
}

function transformUrl(input) {
  const inner = input.replace(/{(.*?)}/g, part => `$${camelize(part)}`);
  const q = inner.includes('${') ? '`' : "'";
  return `${q}${inner}${q}`;
}

function getPathDestruct({ rawUrl }) {
  const m = rawUrl.match(/{.*?}/g);
  if (!m) return '';
  const inner = m.map(p => p.replace('{', '').replace('}', '')).join(', ');
  return `const { ${inner} } = path;`;
}

function getHasParameters(methodOptions) {
  const { parameters } = methodOptions;
  const { requestBody } = methodOptions;
  const { query, path } = groupBy(parameters || [], 'in');
  return {
    path: !!path && !!path.length,
    query: !!query && !!query.length,
    body: !!requestBody && !!requestBody.content,
  };
}

function createResponseType({ rootNamespace, name, methodOptions }) {
  const keys = Object.keys(methodOptions.responses || {});
  const successKey = find(keys, key => Number(key) < 400);
  if (!successKey || !methodOptions.responses[successKey].content)
    return 'void';
  return `${rootNamespace}.${name}.responses.$${successKey}`;
}

function createInputArgs({ rootNamespace, name, hasParams }) {
  const pathArgs = hasParams.path && `${rootNamespace}.${name}.$pathParameters`;
  const queryArgs =
    hasParams.query && `${rootNamespace}.${name}.$queryParameters`;
  const bodyArgs = hasParams.body && `${rootNamespace}.${name}.$requestBody`;
  return [
    pathArgs && `path: ${pathArgs}`,
    queryArgs && `query: ${queryArgs}`,
    bodyArgs && `body: ${bodyArgs}`,
  ]
    .filter(Boolean)
    .join(', ');
}

function getParams({ path, ...hasParams }) {
  return !Object.values(hasParams).some(Boolean)
    ? ''
    : `{ ${['query', 'body'].filter(i => hasParams[i]).join(', ')} }`;
}

function getFns({ rootNamespace, config }) {
  const fns = [];
  for (const [rawUrl, urlOptions] of Object.entries(config.paths)) {
    const url = transformUrl(rawUrl);
    if (urlOptions.parameters) {
      const parameters = urlOptions.parameters;
      delete urlOptions.parameters;
      for (const methodOptions of Object.values(urlOptions)) {
        methodOptions.parameters = [
          ...parameters,
          ...(methodOptions.parameters || []),
        ];
      }
    }

    for (const [method, methodOptions] of Object.entries(urlOptions)) {
      const name = camelize(methodOptions.operationId, false);
      const pathDestruct = getPathDestruct({ rawUrl });
      const respType = createResponseType({
        rootNamespace,
        name,
        methodOptions,
      });
      const hasParams = getHasParameters(methodOptions);
      const inputArgs = createInputArgs({ rootNamespace, name, hasParams });
      const params = getParams(hasParams);
      fns.push({
        name:
          method === 'get' && name.indexOf('get') !== 0
            ? `get${capitalize(name)}`
            : name,
        url,
        method,
        inputArgs,
        pathDestruct,
        respType,
        params,
      });
    }
  }
  return fns;
}

function createApi({ fns, config, outputName }) {
  const firstServer = first(config.servers);
  const host = firstServer && firstServer.url;
  const createFetchImpl = host
    ? `const fetch = createFetch({ host: '${host}' });\n`
    : 'const fetch = createFetch();\n';

  const strs = [
    `///<reference path="./${outputName}.d.ts"/>`,
    `import { createFetch } from './createFetch';\n`,
    createFetchImpl,
    ...fns.map(fn => compile('fnTemplate', fn)),
  ];

  return strs.join('\n');
}

function createResources({ fns, outputName }) {
  const gets = fns.filter(({ method }) => method === 'get');
  const imports = gets.map(({ name }) => name).join(', ');

  const impls = gets.map(fn => {
    const inputArgsWOTypes = fn.inputArgs
      .split(',')
      .map(i => i.split(':')[0])
      .join(',');
    const rName = camelize(
      `create_${
        fn.name.toLowerCase().indexOf('get') === 0
          ? fn.name.substring(3)
          : fn.name
      }_resource`,
      false,
    );
    return `export function ${rName}(${fn.inputArgs}): Resource<${fn.respType}> {
      return createResource(() => ${fn.name}(${inputArgsWOTypes}));
    }\n`;
  });

  const strs = [
    `///<reference path="./${outputName}.d.ts"/>`,
    `import { createResource, Resource } from './createResource';`,
    `import { ${imports} } from './${outputName}';\n`,
    ...impls,
  ];

  return strs.join('\n');
}

async function main({
  rootNamespace = 'API',
  outputName = 'api',
  outputFolder,
  repo,
}) {
  const config = await loadOpenApi(repo);
  const fns = getFns({ rootNamespace, config });

  log('dts').generate.start();
  const dts = await dtsGenerator({
    typeNameConvertor: createTypeNameConverter({ rootNamespace }),
    contents: [config],
  });
  log('dts').generate.done();

  log('api implementation').generate.start();
  const api = createApi({ fns, config, outputName });
  log('api implementation').generate.done();

  log(`resource's implementation`).generate.start();
  const resources = createResources({ fns, outputName });
  log(`resource's implementation`).generate.done();

  writeOutput(outputFolder, `${outputName}.d.ts`, dts, 'dts');
  writeOutput(outputFolder, `${outputName}.ts`, api, 'api implementation');
  writeOutput(
    outputFolder,
    `${outputName}Resources.ts`,
    resources,
    `resource's implementation`,
  );

  createRealmSchemas(outputFolder, `${outputName}.d.ts`);
}

main({
  id: 'api',
  script: 'openapi',
  rootNamespace: '$api',
  outputFolder: 'app/resources',
  repo: {
    token: '92fa36c32e3ef4da2a224afd4e4c79cfbfac9ef2',
    owner: 'AlexBeznos',
    name: 'medlibra_api',
    path: 'docs/openapi.json',
  },
});

module.exports = main;
