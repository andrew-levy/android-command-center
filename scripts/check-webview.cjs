const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('media/panel.js', 'utf8');
new vm.Script(script, { filename: 'panel.js' });
console.log('Webview JavaScript syntax is valid.');
