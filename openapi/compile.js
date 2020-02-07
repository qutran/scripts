const fs = require('fs');
const path = require('path');

const cache = new Map();

function getTemplate(name) {
  if (!cache.has(name)) {
    cache.set(name, fs.readFileSync(path.join(__dirname, `./${name}`), 'utf8'));
  }

  return cache.get(name);
}

function compile(templateName, params) {
  const template = getTemplate(templateName);
  return template.replace(/{.*?}/g, part => {
    const key = part.replace('{', '').replace('}', '');
    return params[key];
  });
}

module.exports.compile = compile;
