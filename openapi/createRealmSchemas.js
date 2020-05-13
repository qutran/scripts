const TJS = require('typescript-json-schema');
const path = require('path');
const prettier = require('prettier');
const prettierOptions = require(path.join(process.cwd(), './.prettierrc.js'));
const fs = require('fs');
const { capitalize } = require('sugar').String;
const { resolve, join } = require('path');
const { log } = require('../common/log');

function extractEntityName(input) {
  return input.split('.')[1];
}

function format(input) {
  return prettier.format(input, {
    ...prettierOptions,
    parser: 'typescript',
  });
}

function walk({
  classes = new Map(),
  parent = '',
  root = false,
  name,
  type,
  items,
  properties,
}) {
  const isObject = type === 'object';
  const isArray = type === 'array';
  const parentName = `${parent}${capitalize(name)}`;

  if (isObject) {
    classes.set(parentName, []);
    if (!!parent) {
      classes.get(parent).push([name, parentName]);
    }
    for (const [objName, data] of Object.entries(properties)) {
      walk({ parent: parentName, name: objName, classes, ...data });
    }
  } else if (isArray) {
    if (!!parent) {
      classes.get(parent).push([name, `${parentName}Item[]`]);
    }
    walk({ name: root ? parentName : `${parentName}Item`, classes, ...items });
  } else {
    classes.get(parent).push([name, type]);
  }

  return classes;
}

function createSchemas(def) {
  if (def.type === 'object' && def.properties.hasNext) {
    const { hasNext, hasPrev, ...rest } = def.properties;
    const nextDef = rest[Object.keys(rest)[0]];
    def = { ...def, ...nextDef };
  }

  const classes = walk({ ...def, root: true });

  const input = [...classes.entries()]
    .map(([key, value]) => {
      const idPresents = !!value.find(([key]) => key === 'id');
      const schema = {
        name: key,
        properties: Object.fromEntries(
          value.map(([key, value]) => {
            let nextType = value;
            const isId = key === 'id';
            if (value === 'number') {
              nextType = isId ? 'int' : 'float';
            } else if (value === 'boolean') {
              nextType = 'bool';
            }
            return [key, nextType];
          }),
        ),
      };

      if (idPresents) schema.primaryKey = 'id';

      return `class ${key} {
        static schema = ${JSON.stringify(schema)}

        ${value.map(([key, type]) => `${key}: ${type}`).join('\n')}
      }\n`;
    })
    .join('\n');

  return {
    schemas: [...classes.keys()],
    classes: format(input),
  };
}

function createRealmSchemas(outputFolder, dts) {
  log('realm schemas').generate.start();
  const input = join(outputFolder, dts);
  const pathToFile = resolve(process.cwd(), input);

  const program = TJS.getProgramFromFiles([pathToFile]);
  const generator = TJS.buildGenerator(program, { ignoreErrors: true }, [
    pathToFile,
  ]);

  const defs = generator
    .getUserSymbols()
    .filter(path => /\$200$/.test(path))
    .map(path => ({
      name: extractEntityName(path),
      ...generator.getSchemaForSymbol(path),
    }));

  const schemas = defs.map(def => createSchemas(def));
  const modelSchemas = schemas.map(item => item.schemas[0]);
  const classesDef = schemas.map(item => item.classes).join('\n');
  const schemasDef = `export const schemas = [${schemas
    .map(item => item.schemas)
    .join(',')}]\n`;
  const modelSchemasDef = `export const modelSchemas = {${modelSchemas.join(
    ',',
  )}}\n`;

  const result = format(`${classesDef}\n${schemasDef}\n${modelSchemasDef}`);

  log('realm schemas').generate.done();
  fs.writeFileSync(path.join(outputFolder, `apiSchemas.ts`), result);
  log('realm schemas').save.start();
  log('realm schemas').save.done();
}

module.exports.createRealmSchemas = createRealmSchemas;
