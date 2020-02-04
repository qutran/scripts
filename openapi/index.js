const { Octokit } = require('@octokit/rest');
const path = require('path');
const fs = require('fs');
const prettier = require('prettier');
const prettierOptions = require(path.join(process.cwd(), './.prettierrc.js'));
const {
  default: dtsGenerator,
  DefaultTypeNameConvertor,
} = require('dtsgenerator');
const { log, startLoading, stopLoading } = require('../common/log');

function p(...args) {
  return path.join(process.cwd(), ...args);
}

function writeDTS(content, { dtsOutput }) {
  fs.writeFileSync(dtsOutput, content);
}

function writeAPI(content, { apiOutput }) {
  fs.writeFileSync(apiOutput, content);
}

async function getOpenAPI({ owner, name, path, token }) {
  const octokit = new Octokit({ auth: `token ${token}` });
  const { data } = await octokit.repos.getContents({
    owner,
    path,
    repo: name,
  });
  return JSON.parse(Buffer.from(data.content, 'base64').toString());
}

function generateApi(grouped = new Map(), { rootNamespace, dtsOutput }) {
  const implementations = [
    `///<reference path="./${dtsOutput.split('/').pop()}"/>`,
    `import { fetch } from './fetch';`,
  ];
  grouped.forEach(({ path, method, responseKey, hasRequestBody }, key) => {
    const dts = `${rootNamespace}.${key}`;
    const resDts = responseKey ? `${dts}.responses.$${responseKey}` : 'unknown';
    const reqDts = `${dts}.$requestBody`;
    const body = `return fetch.${method}<${resDts}>('${path}', ${
      hasRequestBody ? 'body' : ''
    })`;
    implementations.push(`
      export function ${key}(${
      hasRequestBody ? `body: ${reqDts}` : ''
    }): Promise<${resDts}> { ${body}; }
    `);
  });

  return implementations;
}

function groupByOperationId(content) {
  const grouped = new Map();
  const { paths } = content;
  for (const [path, options] of Object.entries(paths)) {
    for (const method of Object.keys(options)) {
      const methodOptions = options[method];
      const operationId = methodOptions.operationId
        .split('-')
        .map((p, i) => (i ? p.charAt(0).toUpperCase() + p.substring(1) : p))
        .join('');

      const responseWithContent = Object.entries(
        methodOptions.responses,
      ).filter(([code, { content }]) => !!content && Number(code) < 400)[0];
      const responseKey = responseWithContent && responseWithContent[0];
      const hasRequestBody = !!methodOptions.requestBody;
      grouped.set(operationId, { path, method, hasRequestBody, responseKey });
    }
  }

  return grouped;
}

async function main({
  rootNamespace = 'API',
  outputName = 'api',
  outputFolder,
  repo,
}) {
  const apiOutput = p(outputFolder, `${outputName}.ts`);
  const dtsOutput = p(outputFolder, `${outputName}.d.ts`);
  const config = { rootNamespace, apiOutput, dtsOutput };

  log('openapi config').load.start();
  startLoading();
  const content = await getOpenAPI(repo);
  stopLoading();
  log('openapi config').load.done();
  log('dts').generate.start();
  const output = await dtsGenerator({
    typeNameConvertor: id => {
      const names = DefaultTypeNameConvertor(id);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        names[i] = i
          ? name[0].toLowerCase() + name.substring(1)
          : rootNamespace;
      }
      names[names.length - 1] = `$${names[names.length - 1]}`;
      return names;
    },
    contents: [content],
  });
  log('dts').generate.done();

  const formattedDTS = prettier.format(output, {
    ...prettierOptions,
    parser: 'typescript',
  });

  const grouped = groupByOperationId(content, config);
  const api = generateApi(grouped, config).join('\n');
  const formattedAPI = prettier.format(api, {
    ...prettierOptions,
    parser: 'typescript',
  });

  log('dts').save.start();
  writeDTS(formattedDTS, config);
  log('dts').save.done();
  log('api implementation').save.start();
  writeAPI(formattedAPI, config);
  log('api implementation').save.done();
}

module.exports = main;
