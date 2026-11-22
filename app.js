/* JB Walkie v1.0 — browser-only peer-to-peer push-to-talk, 1:1, WebRTC + PeerJS.
   The room token is a bearer secret: share it only with people you trust.
   Uses PeerJS public signaling and the publicly documented Open Relay coturn auth.
   The public TURN server may change availability or usage policy.
*/
(() => {
'use strict';
const $=id=>document.getElementById(id);
const ui={intro:$('intro'),room:$('room'),nick:$('nickname'),create:$('createBtn'),title:$('heroTitle'),sub:$('heroSubtitle'),status:$('statusLine'),net:$('networkLabel'),netDot:$('networkDot'),roomLabel:$('roomLabel'),pill:$('roomPill'),pillText:$('roomPillText'),me:$('meName'),meAv:$('meAvatar'),friend:$('friendName'),friendAv:$('friendAvatar'),friendLabel:$('friendLabel'),voice:$('voiceHeading'),caption:$('voiceCaption'),ptt:$('pttBtn'),pttLabel:$('pttLabel'),pttHint:$('pttHint'),mode:$('tapMode'),audio:$('remoteAudio'),time:$('callTime'),share:$('shareBtn'),qr:$('qrBtn'),leave:$('leaveBtn'),modal:$('modal'),modalTitle:$('modalTitle'),modalContent:$('modalContent'),close:$('modalClose'),toast:$('toast'),help:$('helpBtn')};
let peer=null,conn=null,call=null,micStream=null,host=false,roomId='',friendName='',speech=false,remoteSpeech=false,joined=false,ready=false,clock=null,clockStart=0,toastTimer=null,retryTimer=null,session=0,wakeLock=null,activePointer=null;
const storageNick=localStorage.getItem('jbwalkie_nick')||'';
ui.nick.value=storageNick;
function randomHex(bytes=12){const b=new Uint8Array(bytes);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}
function shortName(text){return (text||'Convidado').trim().slice(0,22)||'Convidado';}
function initials(text){const a=text.trim().split(/\s+/);return ((a[0]?.[0]||'J')+(a.length>1?a[a.length-1][0]:'')).toUpperCase();}
function setStatus(message){ui.status.textContent=message;}
function showToast(message){ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),3400);}
function errMsg(error){return (error&&error.message)?error.message:String(error||'Erro desconhecido');}
function inviteUrl(){const u=new URL(location.href);u.search='?room='+encodeURIComponent(roomId);u.hash='';return u.href;}
function updateNet(label,online=false){ui.net.textContent=label;ui.netDot.classList.toggle('on',online);}
function setPill(label,connected=false){ui.pillText.textContent=label;ui.pill.classList.toggle('connected',connected);}
function fmtTime(sec){return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
function stopClock(){if(clock)clearInterval(clock);clock=null;ui.time.textContent='00:00';}
function startClock(){stopClock();clockStart=Date.now();clock=setInterval(()=>ui.time.textContent=fmtTime(Math.floor((Date.now()-clockStart)/1000)),1000);}
async function beep(freq=880){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ac=new AC(),o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(.035,ac.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.12);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.13);setTimeout(()=>ac.close().catch(()=>{}),250)}catch{}}
function modal(title){ui.modalTitle.textContent=title;ui.modalContent.replaceChildren();ui.modal.showModal();}
function modalP(text){const p=document.createElement('p');p.textContent=text;ui.modalContent.append(p);return p;}
function modalButton(label,fn){const b=document.createElement('button');b.className='copy-btn';b.textContent=label;b.addEventListener('click',fn);ui.modalContent.append(b);return b;}
function closeModal(){ui.modal.close();}
async function clip(text){try{await navigator.clipboard.writeText(text);showToast('Link copiado!');return true}catch{showToast('Não foi possível copiar. Seleciona o endereço.');return false;}}
function shareModal(){if(!roomId)return;modal('Convida um amigo');modalP('Envia este link por WhatsApp, SMS ou NFC. Quem abrir poderá entrar na tua sala, mesmo com 4G/5G ou outro Wi-Fi.');const t=document.createElement('div');t.className='invite-link';t.textContent=inviteUrl();ui.modalContent.append(t);modalButton('Copiar link',()=>clip(inviteUrl()));if(navigator.share)modalButton('Partilhar no telemóvel',async()=>{try{await navigator.share({title:'JB Walkie · Sala privada',text:'Entra na minha sala para conversarmos por voz!',url:inviteUrl()})}catch{}});}
function qrModal(){if(!roomId)return;modal('QR da sala privada');modalP('O teu amigo pode apontar a câmara para entrar na mesma sala.');const el=document.createElement('div');el.className='qr-wrap';ui.modalContent.append(el);if(window.QRCode){new QRCode(el,{text:inviteUrl(),width:210,height:210,colorDark:'#16142e',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}else{modalP('O gerador de QR não carregou. Usa o botão Partilhar.')}modalButton('Copiar link',()=>clip(inviteUrl()));}
function helpModal(){modal('Como funciona');modalP('1. Cria uma sala e partilha o link via NFC, mensagem ou QR. 2. O teu amigo entra e autoriza o microfone. 3. Mantém premido FALAR para transmitir, ou ativa o modo Toque para falar.');modalP('A ligação usa WebRTC encriptado. O NFC apenas partilha o convite; o áudio usa internet. Pode funcionar em redes diferentes, mas algumas redes exigem TURN. O relay público de teste não ficou validado e não há garantia em todas as redes.');modalP('Esta versão é para duas pessoas. A sala é privada por link, não por palavra-passe ou conta. Evita publicar o convite. Mantém o navegador aberto e o ecrã ativo durante a conversa.');}
async function publicTurn(){
  const expiry=Math.floor(Date.now()/1000)+12*3600;
  const username=expiry+':jbwalkie';
  try{
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('openrelayprojectsecret'),{name:'HMAC',hash:'SHA-1'},false,['sign']);
    const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(username));
    const credential=btoa(String.fromCharCode(...new Uint8Array(signature)));
    return [{urls:['turn:staticauth.openrelay.metered.ca:80?transport=udp','turn:staticauth.openrelay.metered.ca:443?transport=tcp','turns:staticauth.openrelay.metered.ca:443?transport=tcp'],username,credential}];
  }catch(e){console.warn('TURN authentication unavailable',e);return[];}
}
function updateVoice(){
  ui.ptt.disabled=!ready;
  const speaking=speech;
  ui.ptt.classList.toggle('speaking',speaking);
  ui.room.classList.toggle('talking',speaking||remoteSpeech);
  ui.pttLabel.textContent=!ready?'AGUARDA':speaking?'A FALAR':ui.mode.checked?'TOCA':'FALAR';
  ui.pttHint.textContent=!ready?'SEM LIGAÇÃO':speaking?'A TRANSMITIR':ui.mode.checked?'TOCA PARA ALTERNAR':'MANTÉM PREMIDO';
  if(!ready){ui.voice.textContent=host?'A aguardar companhia':'A estabelecer ligação';ui.caption.textContent=host?'Partilha o link ou QR com um amigo.':'Aguarda enquanto os telemóveis se ligam.'}
  else if(speech){ui.voice.textContent='Estás a transmitir';ui.caption.textContent='O teu amigo está a ouvir-te.'}
  else if(remoteSpeech){ui.voice.textContent=friendName+' está a falar';ui.caption.textContent='Estás a ouvir. Aguarda ou fala quando quiseres.'}
  else{ui.voice.textContent='Ligados e prontos';ui.caption.textContent=ui.mode.checked?'Toca no botão para ativar o microfone.':'Mantém premido o botão para falar.'}
}
function setSpeech(on){
  if(!ready||!micStream||!micStream.getAudioTracks().length)on=false;
  if(speech===on)return;
  speech=on;
  micStream?.getAudioTracks().forEach(t=>t.enabled=on);
  try{if(conn?.open)conn.send({type:'talk',on})}catch{}
  if(on)beep(740);
  updateVoice();
}
function endSpeech(){activePointer=null;setSpeech(false);}
async function unlockAudio(){if(!ui.audio.srcObject)return;try{await ui.audio.play()}catch{showToast('Toca no ecrã para permitir ouvir o áudio.');}}
async function acquireMic(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Este navegador não permite aceder ao microfone.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  stream.getAudioTracks().forEach(track=>{track.enabled=false;track.onended=()=>{setStatus('O microfone foi interrompido. Sai e volta a entrar.');setSpeech(false);}});
  return stream;
}
function resetMedia(){
  endSpeech();remoteSpeech=false;ready=false;
  try{call?.close()}catch{}call=null;
  try{conn?.close()}catch{}conn=null;
  try{peer?.destroy()}catch{}peer=null;
  try{micStream?.getTracks().forEach(t=>t.stop())}catch{}micStream=null;
  ui.audio.pause();ui.audio.srcObject=null;
  stopClock();if(retryTimer)clearTimeout(retryTimer);retryTimer=null;
  if(wakeLock){try{wakeLock.release()}catch{}wakeLock=null;}
}
function setWaiting(){
  ready=false;setSpeech(false);remoteSpeech=false;
  ui.friend.textContent='À espera...';ui.friendAv.textContent='?';ui.friendLabel.textContent='Convida alguém';
  setPill('À espera');updateVoice();
}
function attachCall(mc){
  if(call&&call!==mc){try{call.close()}catch{}}
  call=mc;
  mc.on('stream',async(stream)=>{
    if(mc!==call)return;
    ui.audio.srcObject=stream;
    ui.audio.volume=1;
    try{await ui.audio.play()}catch{showToast('Toca no ecrã para ativar o som.');}
    ready=true;setPill('Ligados',true);updateNet('ÁUDIO LIGADO',true);setStatus('Ligação de voz ativa · WebRTC encriptado');
    updateVoice();startClock();beep(990);
    try{if(navigator.wakeLock?.request)wakeLock=await navigator.wakeLock.request('screen')}catch{}
  });
  mc.on('close',()=>{if(call!==mc)return;call=null;ui.audio.srcObject=null;stopClock();ready=false;setSpeech(false);setPill('Interrompido');setStatus('A chamada terminou. Podes sair e criar outra sala.');updateVoice();});
  mc.on('error',(e)=>{setStatus('Erro na ligação de áudio: '+errMsg(e));ready=false;updateVoice();});
}
function sendHello(){if(conn?.open)conn.send({type:'hello',name:shortName(ui.nick.value)});}
function bindConnection(c){
  if(conn?.open && conn!==c){try{c.send({type:'full'})}catch{}c.close();return;}
  conn=c;
  c.on('open',()=>{
    if(c!==conn)return;
    sendHello();setStatus('Ligação estabelecida. A iniciar áudio...');
    if(!host){const mc=peer.call(c.peer,micStream);if(!mc){setStatus('Não foi possível iniciar a chamada.');return;}attachCall(mc);}
  });
  c.on('data',d=>{
    if(!d||typeof d!=='object')return;
    if(d.type==='hello'){
      friendName=shortName(d.name);
      ui.friend.textContent=friendName;ui.friendAv.textContent=initials(friendName);ui.friendLabel.textContent='Na sala';
      if(host&&c.open){sendHello();}
    }
    if(d.type==='talk'){remoteSpeech=Boolean(d.on);if(remoteSpeech)beep(540);updateVoice();}
    if(d.type==='full'){setStatus('Esta sala já tem duas pessoas.');showToast('Sala cheia (máximo 2 pessoas).');}
    if(d.type==='bye'){setStatus('O teu amigo saiu da sala.');}
  });
  c.on('close',()=>{if(c!==conn)return;conn=null;ready=false;setSpeech(false);remoteSpeech=false;try{call?.close()}catch{}call=null;stopClock();setPill(host?'À espera':'Desligado');setStatus(host?'O teu amigo saiu. Partilha o convite para entrar novamente.':'O anfitrião desligou. Sai e volta a entrar.');ui.friend.textContent='À espera...';ui.friendAv.textContent='?';ui.friendLabel.textContent='Sem ligação';updateVoice();});
  c.on('error',e=>setStatus('Erro na ligação de dados: '+errMsg(e)));
}
function registerHost(id,opts,mySession){
  peer=new Peer(id,opts);
  peer.on('open',()=>{
    if(session!==mySession)return;
    host=true;setWaiting();setPill('À espera');updateNet('SALA CRIADA',true);
    setStatus('Sala criada. Envia o link ou mostra o QR para um amigo.');showToast('Sala criada! Partilha o convite.');
  });
  peer.on('connection',c=>{if(session!==mySession){c.close();return;}if(!host){c.close();return;}bindConnection(c);});
  peer.on('call',mc=>{if(session!==mySession){mc.close();return;}if(conn&&mc.peer===conn.peer){attachCall(mc);mc.answer(micStream)}else mc.close();});
  peer.on('error',e=>{
    if(session!==mySession)return;
    if(e.type==='unavailable-id' && !host){try{peer.destroy()}catch{}setStatus('Sala encontrada. A entrar como convidado...');registerGuest(id,opts,mySession);return;}
    setStatus('Problema com a ligação: '+errMsg(e));
    if(e.type==='network'||e.type==='server-error')showToast('O servidor gratuito não respondeu. Tenta novamente.');
  });
  peer.on('disconnected',()=>{if(session===mySession&&peer&&!peer.destroyed){setStatus('A recuperar a ligação ao servidor...');setTimeout(()=>{try{if(peer?.disconnected)peer.reconnect()}catch{}},1800)}});
}
function registerGuest(id,opts,mySession){
  host=false;peer=new Peer(undefined,opts);setPill('A entrar');updateNet('À PROCURA DA SALA');
  peer.on('open',()=>{
    if(session!==mySession)return;
    const c=peer.connect(id,{reliable:true});
    bindConnection(c);
    retryTimer=setTimeout(()=>{if(session===mySession&&!c.open){setStatus('Não foi possível entrar. Confirma que o anfitrião está online e tenta novamente.');showToast('Não foi possível estabelecer ligação.')}},17000);
  });
  peer.on('call',mc=>{if(session!==mySession){mc.close();return;}attachCall(mc);mc.answer(micStream);});
  peer.on('error',e=>{if(session!==mySession)return;setStatus('Erro ao entrar: '+errMsg(e));});
  peer.on('disconnected',()=>{if(session===mySession)try{peer.reconnect()}catch{}});
}
async function enterRoom(id){
  if(joined)return;
  if(!window.Peer){showToast('O serviço de chamada não carregou. Verifica a internet.');setStatus('Não foi possível carregar PeerJS.');return;}
  if(!window.isSecureContext){showToast('O microfone precisa de HTTPS.');return;}
  if(!/^[0-9a-f]{24}$/.test(id)){showToast('Convite inválido. Cria outra sala.');return;}
  const mySession=++session;roomId=id;joined=true;host=false;ready=false;
  const nickname=shortName(ui.nick.value);localStorage.setItem('jbwalkie_nick',nickname);ui.me.textContent=nickname;ui.meAv.textContent=initials(nickname);
  ui.intro.classList.add('hidden');ui.room.classList.remove('hidden');
  ui.title.innerHTML='Fala com<br><span>quem quiseres.</span>';ui.sub.textContent='A ligação está protegida. Podes falar mesmo estando em redes diferentes.';
  ui.roomLabel.textContent=id.slice(0,4).toUpperCase()+' · '+id.slice(4,8).toUpperCase();
  setPill('A ligar');setStatus('A pedir autorização para utilizar o microfone...');updateVoice();
  history.replaceState(null,'',location.pathname+'?room='+id);
  try{micStream=await acquireMic()}catch(e){setStatus('Permissão de microfone necessária: '+errMsg(e));showToast('Autoriza o microfone para conversar.');joined=false;ui.room.classList.add('hidden');ui.intro.classList.remove('hidden');return;}
  if(session!==mySession)return;
  setStatus('A configurar a rede e procurar a sala...');
  const turn=await publicTurn();
  const iceServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},...turn];
  if(session!==mySession)return;
  registerHost('jbwalkie-'+id,{debug:0,secure:true,config:{iceServers}},mySession);
}
function leaveRoom(){
  try{if(conn?.open)conn.send({type:'bye'})}catch{}
  ++session;resetMedia();joined=false;host=false;roomId='';friendName='';speech=false;remoteSpeech=false;
  ui.room.classList.add('hidden');ui.intro.classList.remove('hidden');
  ui.title.innerHTML='A tua voz.<br><span>Sem distância.</span>';
  ui.sub.textContent='Cria uma sala privada e conversa com um amigo, mesmo estando em redes diferentes.';
  history.replaceState(null,'',location.pathname);setStatus('');updateNet('PRONTO PARA LIGAR');setPill('A ligar');
}
ui.create.addEventListener('click',()=>enterRoom(new URL(location.href).searchParams.get('room')||randomHex()));
ui.nick.addEventListener('keydown',e=>{if(e.key==='Enter')ui.create.click()});
ui.leave.addEventListener('click',leaveRoom);
ui.share.addEventListener('click',shareModal);
ui.qr.addEventListener('click',qrModal);
ui.help.addEventListener('click',helpModal);
ui.close.addEventListener('click',closeModal);
ui.modal.addEventListener('click',e=>{if(e.target===ui.modal)closeModal()});
ui.mode.addEventListener('change',()=>{setSpeech(false);updateVoice();});
ui.ptt.addEventListener('pointerdown',e=>{if(ui.mode.checked||!ready)return;activePointer=e.pointerId;try{ui.ptt.setPointerCapture(e.pointerId)}catch{}setSpeech(true);e.preventDefault()});
ui.ptt.addEventListener('pointerup',e=>{if(!ui.mode.checked&&activePointer===e.pointerId)endSpeech();});
ui.ptt.addEventListener('pointercancel',endSpeech);
ui.ptt.addEventListener('lostpointercapture',()=>{if(!ui.mode.checked)endSpeech()});
ui.ptt.addEventListener('click',()=>{if(ui.mode.checked&&ready)setSpeech(!speech)});
ui.ptt.addEventListener('keydown',e=>{if(!ui.mode.checked&&(e.key===' '||e.key==='Enter')){e.preventDefault();if(!e.repeat)setSpeech(true)}});
ui.ptt.addEventListener('keyup',e=>{if(!ui.mode.checked&&(e.key===' '||e.key==='Enter')){e.preventDefault();endSpeech()}});
document.addEventListener('keydown',e=>{if(!ready||ui.mode.checked||e.target===ui.nick)return;if(e.code==='Space'&&!e.repeat){e.preventDefault();setSpeech(true)}});
document.addEventListener('keyup',e=>{if(e.code==='Space'&&!ui.mode.checked&&e.target!==ui.nick){e.preventDefault();endSpeech()}});
window.addEventListener('blur',()=>{if(!ui.mode.checked)endSpeech()});
window.addEventListener('pagehide',()=>{try{peer?.destroy()}catch{}try{micStream?.getTracks().forEach(t=>t.stop())}catch{}});
ui.audio.addEventListener('click',unlockAudio);
window.addEventListener('online',()=>{if(joined)setStatus('A ligação à internet regressou.');});
window.addEventListener('offline',()=>{if(joined)setStatus('Sem internet. A ligação poderá cair.');});
document.addEventListener('visibilitychange',async()=>{if(!document.hidden&&ready){await unlockAudio();if(!wakeLock&&navigator.wakeLock?.request)try{wakeLock=await navigator.wakeLock.request('screen')}catch{}}});
const incoming=new URL(location.href).searchParams.get('room');
if(incoming&&/^[0-9a-f]{24}$/.test(incoming)){ui.create.textContent='✦ Entrar na sala';ui.title.innerHTML='Tens um<br><span>convite privado.</span>';ui.sub.textContent='Um amigo quer conversar contigo. Introduz o teu nome e entra na sala por voz.';}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
