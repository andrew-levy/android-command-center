const test = require('node:test');
const assert = require('node:assert/strict');

const {
  emulatorCreateSupported,
  isCompleteDeepLink,
  isMissingExecutable,
  nearestFontScale,
  parseBatteryDump,
  parseDevices,
  parseEmulatorProfiles,
  summarizeAdb,
  variantFromTask,
} = require('../dist/core.js');

test('variantFromTask preserves modules and produces a readable label', () => {
  assert.deepEqual(variantFromTask(':app:assembleFullDebug'), {
    id: ':app:assembleFullDebug',
    task: ':app:assembleFullDebug',
    name: 'fullDebug',
    module: 'app',
    label: 'app · fullDebug',
  });
});

test('parseDevices preserves edge states and formats model names', () => {
  const devices = parseDevices([
    'List of devices attached',
    'emulator-5554 device product:sdk model:Pixel_9_Pro transport_id:1',
    'R3 offline usb:1-1 product:test model:Physical_Device transport_id:2',
    'R4 unauthorized usb:1-2',
    '',
  ].join('\n'));

  assert.equal(devices.length, 3);
  assert.deepEqual(devices[0], {
    serial: 'emulator-5554',
    state: 'device',
    description: 'Pixel 9 Pro · emulator-5554',
  });
  assert.equal(devices[1].state, 'offline');
  assert.equal(devices[2].state, 'unauthorized');
});

test('deep link and missing executable validation cover expected boundaries', () => {
  assert.equal(isCompleteDeepLink('androidclitest://profile/42'), true);
  assert.equal(isCompleteDeepLink('androidclitest:profile/42'), false);
  assert.equal(isCompleteDeepLink('42://bad'), false);
  assert.equal(isMissingExecutable(Object.assign(new Error('spawn failed'), {code: 'ENOENT'})), true);
  assert.equal(isMissingExecutable(new Error('permission denied')), false);
});

test('summarizeAdb selects the user-facing activity result', () => {
  assert.equal(summarizeAdb('Starting: Intent\nStatus: ok\nActivity: example/.MainActivity'), 'Status: ok');
  assert.equal(summarizeAdb('Starting: Intent'), '');
});

test('emulator profile parsing keeps clean profile ids', () => {
  assert.deepEqual(
    parseEmulatorProfiles('Available profiles:\nmedium_phone\nlarge_phone - Large phone\n--help\n'),
    ['medium_phone', 'large_phone'],
  );
  assert.equal(emulatorCreateSupported('darwin'), true);
  assert.equal(emulatorCreateSupported('win32'), false);
});

test('device control helpers normalize font scale and battery dumps', () => {
  assert.equal(nearestFontScale(1.12), 1.15);
  assert.equal(nearestFontScale(0.9), 0.85);
  assert.deepEqual(parseBatteryDump('Current Battery Service state:\n  level: 15\n  status: 3\n  USB powered: false\n'), {
    level: 15,
    charging: false,
  });
});
