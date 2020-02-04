#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { log } = require('./common/log');

function getScript(name) {
  return require(`./${name}`);
}

function extendItem(source, target) {
  function dive(key, sourceRef, targetRef) {
    if (!targetRef[key]) return;
    if (sourceRef[key] instanceof Object) {
      const nextSourceRef = sourceRef[key];
      const nextTargetRef = targetRef[key];
      if (!nextTargetRef) return;
      for (const key of [
        ...new Set([
          ...Object.keys(nextSourceRef),
          ...Object.keys(nextTargetRef),
        ]),
      ]) {
        dive(key, nextSourceRef, nextTargetRef);
      }
      return;
    }

    sourceRef[key] = targetRef[key];
  }

  for (const key of Object.keys(source)) {
    dive(key, source, target);
  }

  return source;
}

function p(...args) {
  return path.join(process.cwd(), ...args);
}

async function main() {
  const publicConfig = JSON.parse(
    fs.readFileSync(p('.utils.public.json'), 'utf8'),
  );
  const privateConfig = JSON.parse(
    fs.readFileSync(p('.utils.private.json'), 'utf8'),
  );

  for (const privateItem of privateConfig) {
    const publicItem = publicConfig.find(({ id }) => privateItem.id === id);
    if (publicItem) {
      extendItem(publicItem, privateItem);
    }
  }

  for (const { id, script, ...args } of publicConfig) {
    log(`SCRIPT: ${script} for ID: ${id}`).info();
    await getScript(script)(args);
  }
}

main();
