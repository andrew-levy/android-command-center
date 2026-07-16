const fs = require('node:fs');
const vm = require('node:vm');

for (const filename of ['media/panel-logic.js', 'media/panel.js']) {
  const script = fs.readFileSync(filename, 'utf8');
  new vm.Script(script, { filename });
}
console.log('Webview JavaScript syntax is valid.');
