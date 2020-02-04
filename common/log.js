const emojis = require('./emojis');
const colors = require('./colors');

function createMessage(subject, prefix, emoji) {
  return {
    start() {
      console.log(colors.cyan, `${emoji}  ${prefix}ing ${subject}...`);
    },
    done() {
      console.log(colors.green, `${emojis.done}  ${subject} ${prefix}ed!`);
    },
  };
}

let _stopLoading = () => {};

function startLoading() {
  const id = setInterval(() => {
    process.stdout.write('...');
  }, 16);

  _stopLoading = () => {
    clearInterval(id);
    console.log();
  };
}

function stopLoading() {
  _stopLoading();
}

function log(subject) {
  return {
    info() {
      console.log(`\n${emojis.info}  [${subject}]`);
    },
    generate: createMessage(subject, 'generat', emojis.generating),
    save: createMessage(subject, 'sav', emojis.saving),
    load: createMessage(subject, 'load', emojis.loading),
  };
}

module.exports.log = log;
module.exports.startLoading = startLoading;
module.exports.stopLoading = stopLoading;
