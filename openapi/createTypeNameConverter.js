const { DefaultTypeNameConvertor } = require('dtsgenerator');
const { camelize } = require('sugar').String;

function createTypeNameConverter({ rootNamespace }) {
  return function convertTypeName(id) {
    const names = DefaultTypeNameConvertor(id).map((part, index) =>
      index ? camelize(part, false) : rootNamespace,
    );
    names[names.length - 1] = `$${names[names.length - 1]}`;
    return names;
  };
}

module.exports.createTypeNameConverter = createTypeNameConverter;
