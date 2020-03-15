const path = require('path');
const fs = require('fs');
const prettier = require('prettier');
const { plural } = require('pluralize');
const { log } = require('../common/log');
const prettierOptions = require(path.join(process.cwd(), './.prettierrc.js'));

function main({ sourceFolder }) {
  const svgFolder = path.join(process.cwd(), sourceFolder);
  const assetsName = plural(svgFolder.split('/').pop()).toLowerCase();
  const targetFolder = path.join(svgFolder, '..');
  const mapFileOutputPath = `./${path.join(
    sourceFolder,
    `../${assetsName}Map.ts`,
  )}`;
  const mapFilePath = path.join(targetFolder, `./${assetsName}Map.ts`);
  const messageMap = `map for ${sourceFolder}`;

  log(messageMap).generate.start();
  const files = fs.readdirSync(svgFolder);
  const innerContent = files
    .map(name => {
      return `'${
        name.split('.')[0]
      }': require('./${assetsName}/${name}').default,`;
    })
    .join('\n');

  const withState = new Set();
  for (const file of files) {
    if (file.includes('-active')) withState.add(file.split('-active')[0]);
  }

  const withStateType = withState.size
    ? `\nexport type IconsWithState = ${[...withState]
        .map(item => JSON.stringify(item))
        .join(' | ')};`
    : '';

  const content = prettier.format(
    `export const ${assetsName}Map = { ${innerContent} };\n${withStateType}`,
    { ...prettierOptions, parser: 'typescript' },
  );
  log(messageMap).generate.done();

  log(mapFileOutputPath).save.start();
  fs.writeFileSync(mapFilePath, content);
  log(mapFileOutputPath).save.done();
}

module.exports = main;
