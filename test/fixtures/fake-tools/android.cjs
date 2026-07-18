#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
const scenario = process.env.ANDROID_CLI_FAKE_SCENARIO || 'healthy';

function fail(code,message){
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

if(scenario==='cli-error')fail(22,'Fake Android CLI failed before command execution.');
if(args[0]==='--version'||args[0]==='-V'){
  process.stdout.write('Android CLI fake-1.0\n');
}else if(args[0]==='info'){
  if(scenario==='cli-info-error')fail(23,'Fake SDK environment is incomplete.');
  process.stdout.write('sdk: /fake/android/sdk\nversion: fake-1.0\n');
}else if(args[0]==='emulator'&&args[1]==='list'){
  if(scenario!=='no-emulators')process.stdout.write('Fake_Pixel_API_31\nFake_Tablet_API_35\n');
}else if(args[0]==='emulator'&&args[1]==='create'){
  if(args.includes('--list-profiles')){
    process.stdout.write('medium_phone\nlarge_phone\nmedium_tablet\nlarge_desktop\n');
  }else{
    const profileArg=args.find((arg)=>arg.startsWith('--profile='));
    const profile=profileArg?profileArg.slice('--profile='.length):(args[args.indexOf('--profile')+1]||'medium_phone');
    if(scenario==='command-error')fail(24,`Could not create ${profile}.`);
    process.stdout.write(`Created virtual device ${profile}\n`);
  }
}else if(args[0]==='emulator'&&args[1]==='start'){
  if(scenario==='command-error')fail(24,`Could not start ${args[2]||'emulator'}.`);
  process.stdout.write(`${args[2]||'Fake emulator'} started\n`);
}else if(args[0]==='run'){
  if(scenario==='command-error')fail(25,'Fake install failed.');
  process.stdout.write('Installed and launched fake application\n');
}else if(args[0]==='layout'){
  process.stdout.write(JSON.stringify([{text:'Fake fixture',resourceId:'fake/title',contentDesc:'Fixture title',interactions:[],state:[],bounds:'[0,0][200,60]',center:'[100,30]'}],null,2));
  process.stdout.write('\n');
}else if(args[0]==='screen'&&args[1]==='capture'){
  const outputArg=args.find((arg)=>arg.startsWith('--output='));
  if(!outputArg)fail(26,'Missing --output.');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  fs.mkdirSync(require('node:path').dirname(outputArg.slice(9)),{recursive:true});
  fs.writeFileSync(outputArg.slice(9),png);
}else{
  process.stdout.write(`Fake Android CLI accepted: ${args.join(' ')}\n`);
}
