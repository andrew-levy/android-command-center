const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRunTargets,
  isCompleteDeepLink,
  isMissingExecutable,
  parseDevices,
  reconcileRunTargetSelection,
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

test('run targets merge configured AVDs with connected devices and preserve stable emulator ids', () => {
  const targets = buildRunTargets([
    {serial: 'emulator-5554', state: 'device', description: 'Pixel 4 · emulator-5554', avdName: 'Pixel_4_API_31'},
    {serial: 'PHONE-1', state: 'device', description: 'Physical Phone · PHONE-1'},
    {serial: 'PHONE-2', state: 'unauthorized', description: 'Locked Phone · PHONE-2'},
  ], ['Pixel_4_API_31', 'Pixel_9_Pro_API_31']);

  assert.deepEqual(targets, [
    {id: 'avd:Pixel_4_API_31', kind: 'emulator', label: 'Pixel 4 API 31', status: 'online', selectable: true, serial: 'emulator-5554', avdName: 'Pixel_4_API_31'},
    {id: 'avd:Pixel_9_Pro_API_31', kind: 'emulator', label: 'Pixel 9 Pro API 31', status: 'stopped', selectable: false, serial: undefined, avdName: 'Pixel_9_Pro_API_31'},
    {id: 'device:PHONE-1', kind: 'device', label: 'Physical Phone', status: 'online', selectable: true, serial: 'PHONE-1', avdName: undefined},
    {id: 'device:PHONE-2', kind: 'device', label: 'Locked Phone', status: 'unauthorized', selectable: false, serial: 'PHONE-2', avdName: undefined},
  ]);
});

test('run target selection defaults to one active target and preserves valid choices', () => {
  const targets = [
    {id: 'avd:Pixel_4', status: 'online', selectable: true},
    {id: 'device:PHONE-1', status: 'online', selectable: true},
    {id: 'avd:Pixel_9', status: 'stopped', selectable: false},
  ];

  assert.deepEqual(reconcileRunTargetSelection(targets, []), ['avd:Pixel_4']);
  assert.deepEqual(reconcileRunTargetSelection(targets, ['device:PHONE-1']), ['device:PHONE-1']);
  assert.deepEqual(reconcileRunTargetSelection(targets, ['avd:Pixel_9']), ['avd:Pixel_4']);
  assert.deepEqual(reconcileRunTargetSelection([], []), []);
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
