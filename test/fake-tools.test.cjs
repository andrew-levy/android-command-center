const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const android = path.join(__dirname, 'fixtures', 'fake-tools', 'android.cjs');
const adb = path.join(__dirname, 'fixtures', 'fake-tools', 'adb.cjs');

function run(script,args,scenario='healthy'){
  return spawnSync(process.execPath,[script,...args],{
    encoding:'utf8',
    env:{...process.env,ANDROID_CLI_FAKE_SCENARIO:scenario},
  });
}

test('fake Android CLI can represent healthy and partial setup states', () => {
  assert.match(run(android,['--version']).stdout,/fake-1\.0/);
  assert.equal(run(android,['info'],'cli-info-error').status,23);
  assert.equal(run(android,['--version'],'cli-error').status,22);
  assert.equal(run(android,['emulator','list'],'no-emulators').stdout,'');
  assert.match(run(android,['emulator','create','--list-profiles']).stdout,/medium_phone/);
  assert.match(run(android,['emulator','create','medium_phone']).stdout,/Created virtual device medium_phone/);
});

test('fake ADB exposes deterministic device edge states', () => {
  assert.match(run(adb,['devices','-l'],'no-devices').stdout,/List of devices attached/);
  assert.match(run(adb,['devices','-l'],'offline-device').stdout,/offline/);
  assert.match(run(adb,['devices','-l'],'unauthorized-device').stdout,/unauthorized/);
  const multiple = run(adb,['devices','-l'],'multiple-devices').stdout;
  assert.match(multiple,/emulator-5554/);
  assert.match(multiple,/FAKE-PHYSICAL-1/);
});
