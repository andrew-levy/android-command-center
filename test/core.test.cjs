const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildPerformanceIssues,
  emulatorCreateSupported,
  buildRunTargets,
  isCompleteDeepLink,
  isMissingExecutable,
  nearestFontScale,
  parseBatteryDump,
  parseDevices,
  parseEmulatorProfiles,
  parseGfxInfo,
  parseMemInfo,
  parseManifestLaunchInfo,
  parsePackagePermissionStates,
  projectRootSettingValue,
  reconcileRunTargetSelection,
  resolveProjectRootPath,
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

test('resolveProjectRootPath falls back to the workspace folder and accepts relative or absolute overrides', () => {
  const workspace = path.resolve('/repo');
  assert.deepEqual(resolveProjectRootPath('', []), { error: 'no-workspace' });
  assert.deepEqual(resolveProjectRootPath(undefined, [workspace]), {
    rootPath: workspace,
    displayPath: workspace,
  });
  assert.deepEqual(resolveProjectRootPath('apps/android', [workspace]), {
    rootPath: path.resolve(workspace, 'apps/android'),
    displayPath: 'apps/android',
  });
  const absolute = path.resolve('/other/android-app');
  assert.deepEqual(resolveProjectRootPath(absolute, [workspace]), {
    rootPath: absolute,
    displayPath: absolute,
  });
});

test('projectRootSettingValue keeps workspace roots portable and external roots absolute', () => {
  const workspace = path.resolve('/repo');
  assert.equal(projectRootSettingValue(workspace, workspace), '');
  assert.equal(projectRootSettingValue(path.join(workspace, 'apps', 'android'), workspace), 'apps/android');
  assert.equal(projectRootSettingValue(path.resolve('/other/android-app'), workspace), path.resolve('/other/android-app'));
  assert.equal(projectRootSettingValue(path.resolve('/other/android-app')), path.resolve('/other/android-app'));
});

test('emulator profile parsing keeps clean profile ids', () => {
  assert.deepEqual(
    parseEmulatorProfiles('Available profiles:\nmedium_phone\nlarge_phone - Large phone\n--help\n'),
    ['medium_phone', 'large_phone'],
  );
  assert.equal(emulatorCreateSupported('darwin'), true);
  assert.equal(emulatorCreateSupported('win32'), false);
});

test('manifest launch parsing resolves the Android Studio default activity', () => {
  assert.deepEqual(parseManifestLaunchInfo(`
    <manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.minimal">
      <application>
        <activity android:name=".MainActivity" android:exported="true">
          <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
          </intent-filter>
        </activity>
      </application>
    </manifest>
  `), {
    applicationId: 'com.example.minimal',
    launchActivity: 'com.example.minimal.MainActivity',
  });
});

test('package permission parsing distinguishes requested, runtime, and granted states', () => {
  const states = parsePackagePermissionStates(`
    requested permissions:
      android.permission.ACCESS_FINE_LOCATION
      android.permission.CAMERA
      android.permission.INTERNET
    install permissions:
      android.permission.INTERNET: granted=true
    runtime permissions:
      android.permission.ACCESS_FINE_LOCATION: granted=true, flags=[ USER_SET ]
      android.permission.CAMERA: granted=false, flags=[ ]
  `, [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
  ]);
  assert.deepEqual(states, [
    {permission: 'android.permission.ACCESS_FINE_LOCATION', requested: true, runtime: true, granted: true},
    {permission: 'android.permission.CAMERA', requested: true, runtime: true, granted: false},
    {permission: 'android.permission.RECORD_AUDIO', requested: false, runtime: false, granted: false},
  ]);
});

test('device control helpers normalize font scale and battery dumps', () => {
  assert.equal(nearestFontScale(1.12), 1.15);
  assert.equal(nearestFontScale(0.9), 0.85);
  assert.deepEqual(parseBatteryDump('Current Battery Service state:\n  level: 15\n  status: 3\n  USB powered: false\n'), {
    level: 15,
    charging: false,
  });
});

test('performance parsers extract gfxinfo vitals, framestats, and meminfo', () => {
  const gfx = parseGfxInfo([
    'Total frames rendered: 120',
    'Janky frames: 6 (5.00%)',
    'Flags,IntendedVsync,Vsync,FrameCompleted',
    '0,1000000000,1000000000,1012000000',
    '0,1016666667,1016666667,1038333334',
  ].join('\n'));
  assert.equal(gfx.totalFrames, 120);
  assert.equal(gfx.jankyFrames, 6);
  assert.equal(gfx.jankPercent, 5);
  assert.equal(gfx.frameTimesMs.length, 2);
  assert.ok(gfx.slowFrames >= 1);
  assert.equal(parseMemInfo('App Summary\n                TOTAL:   204800\n'), 200);
  assert.deepEqual(
    buildPerformanceIssues({totalFrames: 100, jankyFrames: 10, jankPercent: 10, fps: 40, slowFrames: 4, frameTimesMs: [], memoryMb: 320}),
    [
      '4 frames > 16ms in last sample',
      'Jank 10.0% of rendered frames',
      'Memory 320 MB is elevated',
      'FPS around 40 looks soft',
    ],
  );
});
