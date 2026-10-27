import {validateBackup,defaults} from './core.mjs';
import {firebaseConfig} from './firebase-config.mjs';
const $=s=>document.querySelector(s);
export function nextRecord(current,expected,payload,uid,mutation,now){
  if((current?.version||0)!==expected)return;
  return {version:expected+1,payload,updatedAt:now,updatedBy:uid,mutation};
}
export class CloudStore{
  constructor({onData,onState}){Object.assign(this,{onData,onState,user:null,version:0,pending:null,inflight:false,conflict:false,remote:null,connected:false,ready:false,generation:0});}
  state(t,b=false){this.onState(t,b);}
  gate(open){$('#app').hidden=!open;$('#app').inert=!open;$('#loginPanel').hidden=open;}
  lock(){for(const d of document.querySelectorAll('dialog[open]'))d.close();this.gate(false);this.ready=false;}
  recoveryKey(){let tab;try{tab=sessionStorage.getItem('shift-note-tab');if(!tab){tab=crypto.randomUUID();sessionStorage.setItem('shift-note-tab',tab);}}catch{tab=this.tabId||(this.tabId=crypto.randomUUID());}return 'shift-note-cloud-recovery:'+this.user.uid+':'+tab;}
  keepRecovery(){try{localStorage.setItem(this.recoveryKey(),JSON.stringify({base:this.version,payload:this.pending}));}catch{this.state('端末の復旧保存に失敗・バックアップしてください',true);}}
  start(){
    this.gate(false);
    $('#loginButton').onclick=async()=>{try{await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());}catch(e){$('#loginMessage').textContent=this.error(e);}};
    $('#signOutButton').onclick=async()=>{if(this.pending||this.inflight){alert('クラウドに未保存の変更があります。保存済みになるまで待つか、バックアップを保存してください。');return;}await this.auth.signOut();};
    $('#useRemote').onclick=()=>{if(!confirm('この画面の未保存の変更を退避しましたか？クラウドの最新版に切り替えます。'))return;this.pending=null;this.conflict=false;try{localStorage.removeItem(this.recoveryKey());}catch{}this.accept(this.remote);$('#cloudConflict').hidden=true;$('#app').inert=false;};
    $('#downloadPending').onclick=()=>{if(!this.pending)return;const u=URL.createObjectURL(new Blob([this.pending],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='シフトノート-未同期の変更.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
    window.addEventListener('beforeunload',e=>{if(this.pending||this.inflight){e.preventDefault();e.returnValue='';}});
    try{if(!globalThis.firebase)throw Error('SDK');this.app=firebase.initializeApp(firebaseConfig,'shift-note');this.auth=this.app.auth();this.database=this.app.database();
      this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(()=>this.auth.onAuthStateChanged(u=>this.session(u))).catch(e=>{$('#loginMessage').textContent=this.error(e);});
      $('#loginMessage').textContent='ご自身のGoogleアカウントでログインしてください。';
    }catch{$('#loginMessage').textContent='接続用のプログラムを読み込めません。インターネット接続を確認し、再読み込みしてください。';$('#loginButton').disabled=true;}
  }
  error(e){const c=e?.code||'';return c.includes('permission')||c.includes('PERMISSION')?'このアカウントには保存先へのアクセス権がありません。':c.includes('unauthorized-domain')?'このURLのログイン設定がまだ完了していません。':c.includes('popup-closed')?'ログイン画面が閉じられました。もう一度お試しください。':'クラウドへの接続に失敗しました。接続・ログイン設定を確認してください。';}
  async session(user){
    const generation=++this.generation;this.lock();if(this.ref)this.ref.off();if(this.connection)this.connection.off();this.user=user;this.pending=null;this.inflight=false;this.conflict=false;this.remote=null;this.version=0;
    $('#cloudConflict').hidden=true;
    if(!user){this.onData(defaults());$('#loginMessage').textContent='Googleでログインしてください。';return;}
    $('#loginMessage').textContent='保存先へのアクセスを確認しています…';
    this.ref=this.database.ref('shift_note_private/'+user.uid);this.connection=this.database.ref('.info/connected');
    this.connection.on('value',s=>{this.connected=s.val()===true;if(!this.connected)this.state('オフライン・クラウド未保存',true);else if(this.ready){if(this.pending)this.flush();else this.state('✓ クラウド保存済み');}});
    try{
      const snap=await this.ref.once('value');if(generation!==this.generation)return;
      this.remote=snap.val();this.accept(this.remote);this.ready=true;this.gate(true);$('#storageNote').textContent=user.email+' の専用クラウドに保存します。「クラウド保存済み」を確認してから閉じてください。';
      let recovery;try{recovery=JSON.parse(localStorage.getItem(this.recoveryKey()));}catch{}
      if(recovery?.payload){validateBackup(JSON.parse(recovery.payload));this.pending=recovery.payload;this.onData(validateBackup(JSON.parse(this.pending)));if(recovery.base!==this.version)this.block();else this.flush();}
      this.ref.on('value',s=>{if(generation!==this.generation)return;const r=s.val();this.remote=r;if((r?.version||0)===this.version)return;if(this.inflight&&r?.mutation===this.writingToken)return;if(this.pending||this.inflight){this.block();return;}this.accept(r);},e=>{this.lock();$('#loginMessage').textContent=this.error(e);});
    }catch(e){this.lock();$('#loginMessage').textContent=this.error(e);}
  }
  accept(record){
    if(this.ready){let closed=false;for(const d of document.querySelectorAll('dialog[open]')){d.close();closed=true;}if(closed)$('#announcement').textContent='別の画面で更新されました。最新版に切り替えたため、入力画面を閉じました。';}
    const next=record?validateBackup(JSON.parse(record.payload)):defaults();this.version=record?.version||0;this.remote=record;this.onData(next);this.state(this.connected?'✓ クラウド保存済み':'接続確認中・未保存',!this.connected);
  }
  save(db){if(!this.ready||!this.user){this.state('ログインが必要です',true);return;}this.pending=JSON.stringify(validateBackup(db));this.keepRecovery();this.state('クラウドに保存中…',true);clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),400);}
  block(){this.conflict=true;$('#cloudConflict').hidden=false;this.state('競合・この画面の変更は未同期',true);}
  async flush(){
    if(!this.pending||this.inflight||this.conflict||!this.ready||!this.connected)return;
    const generation=this.generation,payload=this.pending,expected=this.version,uid=this.user.uid;this.writingToken=crypto.randomUUID();const token=this.writingToken;this.inflight=true;
    try{
      const r=await this.ref.transaction(current=>nextRecord(current,expected,payload,uid,token,firebase.database.ServerValue.TIMESTAMP),undefined,false);
      if(generation!==this.generation)return;
      if(!r.committed){this.remote=r.snapshot.val();this.block();return;}
      this.version=r.snapshot.val().version;this.remote=r.snapshot.val();
      if(this.pending===payload){this.pending=null;try{localStorage.removeItem(this.recoveryKey());}catch{}this.state('✓ クラウド保存済み');}else this.keepRecovery();
    }catch(e){if(generation===this.generation)this.state(this.error(e)+' 変更はこの端末に退避中です。',true);}
    finally{if(generation===this.generation){this.inflight=false;if(this.pending&&!this.conflict)this.state('クラウド未保存・再接続時に再試行',true);}}
    if(this.pending&&!this.conflict&&this.connected)setTimeout(()=>this.flush(),1500);
  }
}
