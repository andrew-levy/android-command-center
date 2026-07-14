const vscode=acquireVsCodeApi();
const app=document.getElementById('app');
const chevron='<svg class="chevron" viewBox="0 0 12 12" fill="none"><path d="m2.5 4.5 3.5 3 3.5-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let state={devices:[],emulators:[],cliAvailable:false,cliStatus:'checking',adbStatus:'checking'};
const savedUi=vscode.getState?.()||{};
const savedSections=savedUi.openSections?.map((id)=>id==='project'?'build':id);
let openSections=new Set(savedSections||['build','device']);
let deepLinkDraft=savedUi.deepLinkDraft||'';
let locationState={trail:0,mode:'walk',multiplier:1,status:'idle',arc:0,elapsed:0,angle:0,last:0,lastPush:0,serial:'',error:'',latitude:'',longitude:''};
const trails=[
 {name:'Apple Park Loop',description:'A gentle loop around Apple Park',mode:'walk',loop:true,waypoints:[[37.33272,-122.00833,49],[37.33373,-122.00663,49],[37.33540,-122.00633,49],[37.33675,-122.00759,45],[37.33698,-122.00969,48],[37.33598,-122.01138,49],[37.33431,-122.01169,50],[37.33296,-122.01042,51]]},
 {name:'Golden Gate',description:'Bridge deck round trip with elevation',mode:'run',loop:true,waypoints:[[37.83212,-122.48065,30],[37.82649,-122.47940,30],[37.82074,-122.47873,59],[37.81498,-122.47806,66],[37.80923,-122.47734,44],[37.81498,-122.47795,66],[37.82074,-122.47865,59],[37.82649,-122.47935,30]]},
 {name:'Downtown Drive',description:'An urban loop for navigation testing',mode:'drive',loop:true,waypoints:[[37.78968,-122.40113,18],[37.78922,-122.39648,16],[37.78574,-122.39695,14],[37.78539,-122.40216,16],[37.78760,-122.40434,19]]}
];
let prepared=prepare(trails[0]);
const send=(type,extra={})=>vscode.postMessage({type,...extra});
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const saveUi=()=>vscode.setState?.({deepLinkDraft,openSections:[...openSections]});
const section=(id,title,status,body)=>'<details class="tool-section" data-section="'+id+'"'+(openSections.has(id)?' open':'')+'><summary><span class="section-title">'+title+'</span><span class="section-status">'+status+'</span>'+chevron+'</summary><div class="section-body">'+body+'</div></details>';
const actionButton=(id,label,kind='pill',disabled=false)=>{const op=state.operation?.id===id?state.operation:null;const running=op?.status==='running';const icon=running?'<span class="spinner"></span>':op?.status==='success'?'<span class="action-result success">✓</span>':op?.status==='error'?'<span class="action-result error">!</span>':'';return '<button class="'+kind+' action-button" data-action="'+id+'"'+(running||disabled?' disabled':'')+(running?' aria-busy="true"':'')+'>'+icon+'<span>'+esc(running?op.message:label)+'</span></button>'};

window.addEventListener('message',({data})=>{if(data.type==='state'){state=data.state;if(!deepLinkDraft&&state.deepLinkPrefixes?.length)deepLinkDraft=state.deepLinkPrefixes[0];render()}if(data.type==='location-result'){locationState.error=data.ok?'':data.error;updateLocationText()}});
send('ready');

function render(){
 if(state.initializing){app.innerHTML='<div class="skeleton"><div class="skeleton-card hero"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card short"></div></div>';return}
 const devices=state.devices||[],online=devices.filter((d)=>d.state==='device'),locationDevices=online.filter((d)=>d.serial.startsWith('emulator-')),avds=state.emulators||[];
 if(!locationDevices.some((d)=>d.serial===locationState.serial))locationState.serial=locationDevices[0]?.serial||'';
 const deviceOptions=online.map((d)=>'<option value="'+esc(d.serial)+'"'+(d.serial===locationState.serial?' selected':'')+'>'+esc(d.description)+'</option>').join('');
 const locationOptions=locationDevices.length?locationDevices.map((d)=>'<option value="'+esc(d.serial)+'"'+(d.serial===locationState.serial?' selected':'')+'>'+esc(d.description)+'</option>').join(''):'<option value="">Start an emulator first</option>';
 const variants=state.variants||[],selected=state.selectedVariant||variants[0]?.id||'';
 const cliReady=state.cliStatus==='ready',adbReady=state.adbStatus==='ready';
 const build=buildSection(variants,selected,cliReady);
 const deviceStatus='<span class="location-live"><span class="status-dot '+(online.length?'on':'')+'"></span>'+online.length+' online</span>';
 const device=section('device','Devices',deviceStatus,deviceGrid(devices,avds));
 const inspector=inspectorSection(cliReady);
 const stream=section('stream','Stream','Logcat','<p class="muted">Follow live device logs in the integrated terminal.</p>'+actionButton('logcat','Start log stream','primary block',!adbReady));
 const errorToast=state.error?'<div class="error-toast" role="alert" aria-live="assertive"><span class="error-toast-icon" aria-hidden="true">!</span><span class="error-toast-message">'+esc(state.error)+'</span><button class="error-toast-close" id="dismiss-error" type="button" aria-label="Dismiss error">×</button></div>':'';
 const allReady=state.cliStatus==='ready'&&state.adbStatus==='ready';
 const setup=allReady?'':setupCard();
 const footer=allReady?toolchainFooter():'';
 app.innerHTML=(state.busy?'<div class="busybar"><span>'+esc(state.busy)+'</span></div>':'')+errorToast+setup+build+device+deepLinkSection(deviceOptions,adbReady)+inspector+locationSection(locationOptions,adbReady)+stream+footer;
 bind();
}

function toolchainFooter(){
 const detail=[state.cliVersion,state.adbVersion].filter(Boolean).join('\n')||'Android toolchain ready';
 return '<footer class="toolchain-footer" aria-label="Android toolchain ready"><span class="status-dot on" aria-hidden="true"></span><span title="'+esc(detail)+'">Toolchain ready</span><span class="toolchain-env" title="'+esc(state.environment||'extension host')+'">'+esc(state.environment||'extension host')+'</span><span class="toolchain-spacer"></span><button class="icon-button" data-setup="dependency-settings" title="Android Command Center settings" aria-label="Open Android Command Center settings">⌘</button><button class="icon-button" data-setup="dependency-retry" title="Check toolchain again" aria-label="Check toolchain again">↻</button></footer>';
}

function setupCard(){
 const cli=dependencyRow('Android CLI',state.cliStatus,state.cliVersion,state.cliMessage);
 const adb=dependencyRow('Platform tools',state.adbStatus,state.adbVersion,state.adbMessage);
 const cliAction=state.cliStatus==='missing'
  ? '<button class="primary" data-setup="dependency-install-cli">Prepare install</button><button class="secondary" data-setup="dependency-choose-cli">Choose file…</button>'
  : state.cliStatus==='error'
   ? '<button class="primary" data-setup="dependency-choose-cli">Choose file…</button><button class="secondary" data-setup="dependency-settings">Open settings</button>' : '';
 const adbAction=state.cliStatus==='ready'&&state.adbStatus==='missing'
  ? '<button class="primary" data-setup="dependency-install-adb">Prepare platform tools</button><button class="secondary" data-setup="dependency-choose-adb">Choose adb…</button>'
  : state.adbStatus==='error'
   ? '<button class="secondary" data-setup="dependency-choose-adb">Choose adb…</button>' : '';
 const actions=cliAction||adbAction;
 return '<section class="setup-card" aria-label="Android tool setup"><div class="setup-head"><h2>'+(state.cliStatus==='missing'?'Connect Android CLI':'Finish Android setup')+'</h2><p>Uses tools installed in this development environment · '+esc(state.environment||'extension host')+'</p></div><div class="dependency-list">'+cli+adb+'</div>'+(actions?'<div class="setup-actions">'+actions+'</div>':'')+'<button class="setup-retry" data-setup="dependency-retry"'+(state.cliStatus==='checking'||state.adbStatus==='checking'?' disabled':'')+'><span aria-hidden="true">↻</span> Check again</button></section>';
}

function buildSection(variants,selected,cliReady){
 const active=variants.find((variant)=>variant.id===selected),label=active?.label||'Default target';
 const options=variants.map((variant)=>'<option value="'+esc(variant.id)+'"'+(variant.id===selected?' selected':'')+'>'+esc(variant.label)+'</option>').join('');
 const body='<div class="field"><label class="caption" for="build-variant">Build variant</label><select id="build-variant" title="'+esc(label)+'">'+options+'</select></div><div class="build-row">'+actionButton('build-run','Run app','primary',!cliReady)+actionButton('build','Build','secondary',!cliReady)+actionButton('clean','Clean','secondary',!cliReady)+'</div>';
 return section('build','Build',label,body);
}

function dependencyRow(name,status,version,message){
 const label={checking:'Checking…',ready:'Ready',missing:'Not found',error:'Needs attention'}[status]||'Unknown';
 const detail=status==='ready'?(version||'Available'):status==='checking'?'Looking in PATH and settings':message||'Choose an executable or install it';
 return '<div class="dependency-row '+esc(status)+'"><span class="dependency-icon" aria-hidden="true">'+(status==='ready'?'✓':status==='checking'?'<span class="spinner"></span>':'!')+'</span><span class="dependency-copy"><strong>'+esc(name)+'</strong><span title="'+esc(detail)+'">'+esc(detail)+'</span></span><span class="dependency-state">'+esc(label)+'</span></div>';
}

function deviceGrid(devices,avds){
 const used=new Set();
 const avdCards=avds.map((name)=>{const running=devices.find((d)=>d.avdName===name);if(running)used.add(running.serial);return deviceCard({name,device:running,virtual:true})});
 const connectedCards=devices.filter((d)=>!used.has(d.serial)).map((device)=>deviceCard({name:device.description,device,virtual:device.serial.startsWith('emulator-')}));
 const cards=[...avdCards,...connectedCards];
 return '<p class="muted device-help">All available emulators and connected hardware appear here. Start or stop each one independently.</p><div class="device-grid">'+(cards.length?cards.join(''):'<div class="empty-card">No devices or emulators found</div>')+'</div>';
}

function deviceCard({name,device,virtual}){const online=device?.state==='device',id=device?.serial||name,op=state.operation?.id===`device:${id}`?state.operation:null,running=op?.status==='running',cliReady=state.cliStatus==='ready',adbReady=state.adbStatus==='ready';const loading=running?'<span class="spinner" aria-hidden="true"></span>':'';const action=online&&virtual?'<button class="pill danger-button device-action-button" data-stop="'+esc(device.serial)+'"'+(running||!adbReady?' disabled':'')+(running?' aria-busy="true"':'')+'>'+loading+'<span>'+(running?'Stopping…':'Stop')+'</span></button>':!online&&virtual?'<button class="pill device-action-button" data-start="'+esc(name)+'"'+(running||!cliReady?' disabled':'')+(running?' aria-busy="true"':'')+'>'+loading+'<span>'+(running?'Starting…':'Start')+'</span></button>':'';const theme=online?'<div class="theme-toggle" aria-label="Device appearance"><button data-theme="light" data-serial="'+esc(device.serial)+'" class="'+(device.theme==='light'?'active':'')+'" title="Use light mode"'+(adbReady?'':' disabled')+'>☀</button><button data-theme="dark" data-serial="'+esc(device.serial)+'" class="'+(device.theme==='dark'?'active':'')+'" title="Use dark mode"'+(adbReady?'':' disabled')+'>☾</button></div>':'';return '<article class="device-card '+(online?'online':'')+'"><div class="device-card-head"><div class="device-icon">'+(virtual?'▯':'▰')+'</div><span class="status-dot '+(online?'on':'')+'"></span></div><strong title="'+esc(name)+'">'+esc(name.replaceAll('_',' '))+'</strong><span class="device-meta">'+esc(device?.serial||(virtual?'Available emulator':'Connected device'))+'</span><div class="device-actions">'+theme+action+'</div></article>'}

function inspectorAction(id,icon,title,description,disabled=false){const op=state.operation?.id===id?state.operation:null,running=op?.status==='running';return '<button class="inspector-tile" data-action="'+id+'" title="'+esc(description)+'"'+(running||disabled?' disabled':'')+(running?' aria-busy="true"':'')+'><span class="inspector-tile-icon" aria-hidden="true">'+(running?'<span class="spinner"></span>':op?.status==='success'?'<span class="action-result success">✓</span>':op?.status==='error'?'<span class="action-result error">!</span>':icon)+'</span><span>'+esc(title)+'</span></button>'}

function inspectorSection(cliReady){const preview=state.screenshot?'<div class="inspector-preview"><div class="inspector-preview-bar"><span><i></i><i></i><i></i></span><span>Latest capture</span></div><div class="inspector-preview-screen"><img class="preview" src="'+esc(state.screenshot)+'" alt="Latest device screenshot"></div></div>':'<div class="inspector-empty dotted"><span class="inspector-reticle" aria-hidden="true">⌗</span><strong>Device viewfinder</strong><span>Capture a screen to preview it here.</span></div>';return section('inspector','Inspector',state.screenshot?'Capture ready':cliReady?'Ready':'Needs CLI','<div class="inspector-shell">'+preview+'<div class="inspector-actions">'+inspectorAction('screenshot','◎','Capture','Take a clean device snapshot',!cliReady)+inspectorAction('screenshot-annotated','✦','Annotate','Capture with detected UI elements highlighted',!cliReady)+inspectorAction('layout','⌁','Layout','Inspect the accessibility tree as JSON',!cliReady)+'</div></div>')}

function deepLinkSection(deviceOptions,adbReady){
 const prefixes=state.deepLinkPrefixes||[],favorites=state.favoriteDeepLinks||[],recent=state.recentDeepLinks||[];
 const suggestions=[...new Set([...prefixes,...favorites,...recent])];
 const prefixChips=prefixes.length?'<div class="chip-row">'+prefixes.map((uri)=>'<button class="chip" data-link="'+esc(uri)+'">'+esc(uri)+'</button>').join('')+'</div>':'<p class="muted">Build once to discover schemes from the selected variant.</p>';
 const favoriteRows=linkRows(favorites,true),draftFavorite=favorites.includes(deepLinkDraft);
 const recentRows=linkRows(recent.filter((uri)=>!favorites.includes(uri)),false);
 const result=state.linkResult?'<div class="link-result '+(state.linkResult.ok?'ok':'error')+'">'+esc(state.linkResult.message)+'</div>':'';
 const body='<div class="deeplink-console"><div class="console-bar"><span><i></i><i></i><i></i></span><span>Intent launcher</span><span class="console-signal '+(adbReady?'on':'')+'"></span></div><div class="uri-command"><span class="command-prompt" aria-hidden="true">↗</span><input id="deeplink-uri" list="deeplink-suggestions" value="'+esc(deepLinkDraft)+'" placeholder="myapp://path" aria-label="Deeplink URI"><datalist id="deeplink-suggestions">'+suggestions.map((uri)=>'<option value="'+esc(uri)+'"></option>').join('')+'</datalist><button class="star-button" id="favorite-deeplink" title="Toggle favorite" aria-label="Toggle favorite">'+(draftFavorite?'★':'☆')+'</button></div><div class="deeplink-target"><select id="deeplink-device" aria-label="Target device">'+deviceOptions+'</select><button class="primary" id="open-deeplink"'+(deepLinkDraft.trim()&&adbReady?'':' disabled')+'>Launch</button></div></div><div class="discovered-links"><div class="micro-heading"><span>Discovered routes</span><span>'+prefixes.length+'</span></div>'+prefixChips+'</div>'+result+(favoriteRows?'<div class="link-group link-vault"><label class="caption">Favorites</label>'+favoriteRows+'</div>':'')+(recentRows?'<div class="link-group link-vault"><div class="link-heading"><label class="caption">Recent</label><button class="text-button" id="clear-deeplinks">Clear</button></div>'+recentRows+'</div>':'');
 return section('deeplinks','Deeplinks',prefixes.length+' discovered',body);
}

function linkRows(items,favorite){return items.map((uri)=>'<div class="link-row"><button class="link-value" data-link="'+esc(uri)+'">'+esc(uri)+'</button><button class="link-star '+(favorite?'active':'')+'" data-favorite="'+esc(uri)+'" title="'+(favorite?'Remove favorite':'Add favorite')+'">'+(favorite?'★':'☆')+'</button></div>').join('')}

function locationSection(deviceOptions,adbReady){const trail=trails[locationState.trail],coordinatesMissing=!locationState.latitude.trim()||!locationState.longitude.trim();const status='<span class="location-live"><span class="status-dot '+(locationState.status==='playing'?'on':'')+'"></span><span id="location-summary">'+locationSummary()+'</span></span>';const manual='<div class="field"><label class="caption" for="location-device">Target emulator</label><select id="location-device">'+deviceOptions+'</select></div><div class="coords"><div class="field"><label class="caption" for="location-latitude">Latitude</label><input id="location-latitude" inputmode="decimal" value="'+esc(locationState.latitude)+'" placeholder="37.7749"></div><div class="field"><label class="caption" for="location-longitude">Longitude</label><input id="location-longitude" inputmode="decimal" value="'+esc(locationState.longitude)+'" placeholder="-122.4194"></div></div>'+actionButton('location','Apply location','secondary block',coordinatesMissing||!adbReady);const route='<div class="section-divider"><span>Simulated route</span></div><div class="route-select"><select id="trail-select" aria-label="Simulated route">'+trails.map((t,i)=>'<option value="'+i+'"'+(i===locationState.trail?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select><div class="route-description" id="route-description">'+esc(trail.description)+'</div></div><div class="route-scene"><canvas id="route-canvas"></canvas><span class="scene-chip elevation low">'+Math.round(prepared.minAlt)+' m</span><span class="scene-chip elevation high">'+Math.round(prepared.maxAlt)+' m</span><div class="route-stats"><div class="stat"><div class="stat-label">Distance</div><div class="stat-value" id="distance-stat">0 m</div></div><div class="stat"><div class="stat-label">Pace</div><div class="stat-value" id="pace-stat">'+formatPace(speed())+'</div></div><div class="stat"><div class="stat-label">Elapsed</div><div class="stat-value" id="elapsed-stat">0:00</div></div></div></div><div class="playback"><button class="primary" id="play-location"'+(adbReady?'':' disabled')+'>'+(locationState.status==='playing'?'Pause':'Play')+'</button><button class="secondary" id="stop-location"'+(adbReady?'':' disabled')+'>Stop</button></div><div class="mode-row"><div class="segmented" role="group" aria-label="Movement mode">'+['walk','run','cycle','drive'].map((m)=>'<button class="segment '+(m===locationState.mode?'active':'')+'" data-mode="'+m+'" title="'+m+'">'+({walk:'●',run:'↗',cycle:'∞',drive:'◆'}[m])+'</button>').join('')+'</div><button class="secondary speed" id="speed-location">'+locationState.multiplier+'×</button></div><div class="location-error" id="location-error">'+esc(locationState.error)+'</div>';return section('location','Location',status,manual+route);}

function bind(){
 document.getElementById('dismiss-error')?.addEventListener('click',()=>send('error-dismiss'));
 app.querySelectorAll('[data-setup]').forEach((el)=>el.addEventListener('click',()=>send(el.dataset.setup)));
 app.querySelectorAll('details[data-section]').forEach((el)=>el.addEventListener('toggle',()=>{el.open?openSections.add(el.dataset.section):openSections.delete(el.dataset.section);saveUi()}));
 app.querySelectorAll('[data-action]').forEach((el)=>el.addEventListener('click',()=>{const action=el.dataset.action;if(action==='screenshot'||action==='screenshot-annotated')send('screenshot',{annotate:action==='screenshot-annotated'});else if(action==='location'){locationState.latitude=document.getElementById('location-latitude')?.value||'';locationState.longitude=document.getElementById('location-longitude')?.value||'';send('location',{serial:locationState.serial,latitude:locationState.latitude,longitude:locationState.longitude})}else send(action,{serial:locationState.serial})}));
 document.getElementById('build-variant')?.addEventListener('change',(e)=>send('variant',{id:e.target.value}));
 document.getElementById('deeplink-uri')?.addEventListener('input',(e)=>{deepLinkDraft=e.target.value;updateDeepLinkButton();saveUi()});
 document.getElementById('open-deeplink')?.addEventListener('click',()=>{const input=document.getElementById('deeplink-uri');deepLinkDraft=input.value;send('deeplink-open',{uri:deepLinkDraft,serial:document.getElementById('deeplink-device')?.value||''})});
 document.getElementById('favorite-deeplink')?.addEventListener('click',()=>send('deeplink-favorite',{uri:document.getElementById('deeplink-uri')?.value||''}));
 document.getElementById('clear-deeplinks')?.addEventListener('click',()=>send('deeplink-clear'));
 app.querySelectorAll('[data-link]').forEach((el)=>el.addEventListener('click',()=>{deepLinkDraft=el.dataset.link;saveUi();const input=document.getElementById('deeplink-uri');if(input){input.value=deepLinkDraft;input.focus()}updateDeepLinkButton()}));
 app.querySelectorAll('[data-favorite]').forEach((el)=>el.addEventListener('click',()=>send('deeplink-favorite',{uri:el.dataset.favorite})));
 app.querySelectorAll('[data-stop]').forEach((el)=>el.addEventListener('click',()=>send('stop',{serial:el.dataset.stop})));
 app.querySelectorAll('[data-start]').forEach((el)=>el.addEventListener('click',()=>send('start',{name:el.dataset.start})));
 app.querySelectorAll('[data-theme]').forEach((el)=>el.addEventListener('click',()=>send('theme',{serial:el.dataset.serial,theme:el.dataset.theme})));
 document.getElementById('location-device')?.addEventListener('change',(e)=>{locationState.serial=e.target.value});
 document.getElementById('location-latitude')?.addEventListener('input',(e)=>{locationState.latitude=e.target.value;updateLocationButton()});
 document.getElementById('location-longitude')?.addEventListener('input',(e)=>{locationState.longitude=e.target.value;updateLocationButton()});
 document.getElementById('trail-select')?.addEventListener('change',(e)=>{locationState.trail=Number(e.target.value);locationState.mode=trails[locationState.trail].mode;resetLocation();prepared=prepare(trails[locationState.trail]);render()});
 document.getElementById('play-location')?.addEventListener('click',()=>{locationState.status=locationState.status==='playing'?'paused':'playing';locationState.last=performance.now();updateLocationText()});
 document.getElementById('stop-location')?.addEventListener('click',()=>{resetLocation();updateLocationText()});
 document.getElementById('speed-location')?.addEventListener('click',()=>{const speeds=[1,2,5,20],i=speeds.indexOf(locationState.multiplier);locationState.multiplier=speeds[(i+1)%speeds.length];render()});
 app.querySelectorAll('[data-mode]').forEach((el)=>el.addEventListener('click',()=>{locationState.mode=el.dataset.mode;render()}));
}

function resetLocation(){locationState.status='idle';locationState.arc=0;locationState.elapsed=0;locationState.lastPush=0}
function speed(){return ({walk:1.4,run:3,cycle:5.5,drive:13.4}[locationState.mode]||1.4)*locationState.multiplier}
function prepare(trail){const origin=trail.waypoints[0],latScale=111320,lngScale=111320*Math.cos(origin[0]*Math.PI/180);let arc=0;const points=trail.waypoints.concat(trail.loop?[trail.waypoints[0]]:[]).map((w,i,all)=>{const p={x:(w[1]-origin[1])*lngScale,z:-(w[0]-origin[0])*latScale,y:w[2]||0,lat:w[0],lng:w[1],arc};if(i){const q=all[i-1];arc+=Math.hypot((w[1]-q[1])*lngScale,(w[0]-q[0])*latScale,(w[2]||0)-(q[2]||0));p.arc=arc}return p});return{points,total:arc,minAlt:Math.min(...points.map(p=>p.y)),maxAlt:Math.max(...points.map(p=>p.y))}}
function pointAt(arc){let d=prepared.total?arc%prepared.total:0;for(let i=1;i<prepared.points.length;i++){const a=prepared.points[i-1],b=prepared.points[i];if(b.arc>=d){const t=(d-a.arc)/(b.arc-a.arc||1);return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t}}}return prepared.points[0]}
function tick(now){const dt=Math.min(64,now-(locationState.last||now));locationState.last=now;locationState.angle=(locationState.angle+dt*.00012)%(Math.PI*2);if(locationState.status==='playing'){locationState.arc=(locationState.arc+speed()*dt/1000)%prepared.total;locationState.elapsed+=dt;if(now-locationState.lastPush>1000){locationState.lastPush=now;const p=pointAt(locationState.arc);send('location-path',{serial:locationState.serial,latitude:p.lat,longitude:p.lng})}updateLocationText()}drawRoute(now);requestAnimationFrame(tick)}
function themeValue(name,fallback){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback}
function drawRoute(now){
 const canvas=document.getElementById('route-canvas');if(!canvas)return;
 const rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const dpr=devicePixelRatio||1,w=rect.width,h=rect.height;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const c=canvas.getContext('2d'),surface=themeValue('--panel','#1a1a1d'),deep=themeValue('--deep','#0a0a0c'),line=themeValue('--text','#fff'),muted=themeValue('--muted','#888'),grid=themeValue('--line','#333');
 c.setTransform(dpr,0,0,dpr,0,0);
 const bg=c.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,Math.max(w,h)*.7);bg.addColorStop(0,surface);bg.addColorStop(1,deep);c.fillStyle=bg;c.fillRect(0,0,w,h);
 c.fillStyle=grid;for(let y=7;y<h;y+=14)for(let x=7;x<w;x+=14){c.beginPath();c.arc(x,y,.7,0,Math.PI*2);c.fill()}
 const pts=prepared.points,minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,extent=Math.max(maxX-minX,maxZ-minZ,1),scale=Math.min(w,h)*.62/extent,sa=Math.sin(locationState.angle),ca=Math.cos(locationState.angle);
 const project=(p)=>{const x=p.x-cx,z=p.z-cz,rx=x*ca+z*sa,rz=-x*sa+z*ca,e=(p.y-prepared.minAlt)*1.4;return{x:w/2+rx*scale,y:h*.53+(rz*.45-e)*scale,ground:h*.53+rz*.45*scale+34}};
 const pp=pts.map(p=>({p,...project(p)}));
 for(let i=1;i<pp.length;i++){const a=pp[i-1],b=pp[i],g=c.createLinearGradient(0,(a.y+b.y)/2,0,(a.ground+b.ground)/2);g.addColorStop(0,line);g.addColorStop(.55,muted);g.addColorStop(1,deep);c.save();c.globalAlpha=.32;c.fillStyle=g;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(b.x,b.ground);c.lineTo(a.x,a.ground);c.fill();c.restore()}
 c.strokeStyle=line;c.lineWidth=1.6;c.lineJoin='round';c.beginPath();pp.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
 const marker=project(pointAt(locationState.arc));
 if(locationState.status==='playing'){const phase=(now%2600)/2600;c.save();c.globalAlpha=.25*(1-phase);c.strokeStyle=line;c.lineWidth=1;c.beginPath();c.arc(marker.x,marker.y,4+22*phase,0,Math.PI*2);c.stroke();c.restore()}
 c.fillStyle=line;c.beginPath();c.arc(marker.x,marker.y,4,0,Math.PI*2);c.fill();
}
function locationSummary(){return locationState.status==='playing'?'Simulating · '+formatDuration(locationState.elapsed):locationState.status==='paused'?'Paused · '+formatDuration(locationState.elapsed):'Idle'}
function updateDeepLinkButton(){const button=document.getElementById('open-deeplink');if(button)button.disabled=!deepLinkDraft.trim()||state.adbStatus!=='ready'}
function updateLocationButton(){const button=document.querySelector('[data-action="location"]');if(button)button.disabled=!locationState.latitude.trim()||!locationState.longitude.trim()||state.adbStatus!=='ready'}
function updateLocationText(){const distance=document.getElementById('distance-stat'),pace=document.getElementById('pace-stat'),elapsed=document.getElementById('elapsed-stat'),play=document.getElementById('play-location'),summary=document.getElementById('location-summary'),error=document.getElementById('location-error');if(distance)distance.textContent=formatDistance(locationState.arc);if(pace)pace.textContent=formatPace(speed());if(elapsed)elapsed.textContent=formatDuration(locationState.elapsed);if(play)play.textContent=locationState.status==='playing'?'Pause':'Play';if(summary)summary.textContent=locationSummary();if(error)error.textContent=locationState.error}
function formatDistance(m){return m<1000?m.toFixed(0)+' m':(m/1000).toFixed(2)+' km'}function formatDuration(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0')}function formatPace(v){if(v>7)return(v*3.6).toFixed(0)+' km/h';const s=1000/v,m=Math.floor(s/60);return m+':'+String(Math.round(s%60)).padStart(2,'0')+'/km'}
requestAnimationFrame(tick);
