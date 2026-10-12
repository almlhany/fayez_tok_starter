// Firebase Web SDK. Replace the configuration below with your own Firebase project values.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};
const configured = !Object.values(firebaseConfig).some(v => v.includes("PASTE_") || v.includes("YOUR_PROJECT_ID"));
const $ = id => document.getElementById(id);
let app, auth, db, storage, currentUser = null, stopFeed = null;
if (configured) {
  app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); storage = getStorage(app);
  onAuthStateChanged(auth, user => { currentUser=user; renderAuth(); subscribeFeed(); });
} else {
  $('authMsg').textContent = 'أولًا اربط التطبيق بمشروع Firebase من ملف app.js (التعليمات في README).';
  ['signup','login','upload'].forEach(id => $(id).disabled=true);
  $('signup').style.opacity=$('login').style.opacity=$('upload').style.opacity='.5';
}
$('signup').onclick = async () => {
  try { await createUserWithEmailAndPassword(auth, $('email').value.trim(), $('password').value); $('authMsg').textContent='تم إنشاء الحساب.'; }
  catch(e){ $('authMsg').textContent=authError(e); }
};
$('login').onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value); $('authMsg').textContent='تم تسجيل الدخول.'; }
  catch(e){ $('authMsg').textContent=authError(e); }
};
$('logout').onclick = async () => { try { await signOut(auth); } catch(e) { $('authMsg').textContent=authError(e); } };
$('upload').onclick = async () => {
  const file=$('videoFile').files[0], caption=$('caption').value.trim();
  if(!currentUser) return $('uploadMsg').textContent='سجّل الدخول أولًا.';
  if(!file || !file.type.startsWith('video/')) return $('uploadMsg').textContent='اختر ملف فيديو صحيحًا.';
  if(file.size > 100*1024*1024) return $('uploadMsg').textContent='الحد الحالي 100 ميغابايت. اختر فيديو أصغر.';
  $('upload').disabled=true; $('uploadMsg').textContent='جارٍ رفع الفيديو…';
  const path=`videos/${currentUser.uid}/${Date.now()}_${safeName(file.name)}`;
  try {
    const task=uploadBytesResumable(ref(storage,path),file,{contentType:file.type});
    await new Promise((resolve,reject)=>task.on('state_changed',s=>{$('uploadMsg').textContent=`جارٍ الرفع: ${Math.round(s.bytesTransferred/s.totalBytes*100)}%`;},reject,resolve));
    const videoUrl=await getDownloadURL(task.snapshot.ref);
    await addDoc(collection(db,'videos'),{uid:currentUser.uid,email:currentUser.email||'',caption,videoUrl,storagePath:path,createdAt:serverTimestamp(),likesCount:0});
    $('caption').value=''; $('videoFile').value=''; $('uploadMsg').textContent='تم النشر بنجاح.';
  } catch(e) { $('uploadMsg').textContent='تعذر النشر: '+e.message; }
  finally {$('upload').disabled=false;}
};
function renderAuth(){
 $('userStatus').textContent=currentUser ? (currentUser.email||'مسجل الدخول') : 'لست مسجلًا';
 $('uploadPanel').classList.toggle('hidden',!currentUser);
 $('logout').classList.toggle('hidden',!currentUser);
 $('signup').classList.toggle('hidden',!!currentUser); $('login').classList.toggle('hidden',!!currentUser);
 if(currentUser) $('authMsg').textContent='تم تسجيل الدخول.';
}
function subscribeFeed(){
 if(stopFeed) stopFeed();
 if(!configured)return;
 const q=query(collection(db,'videos'),orderBy('createdAt','desc'));
 stopFeed=onSnapshot(q,snap=>{
   const feed=$('feed'); feed.innerHTML='';
   if(snap.empty){feed.innerHTML='<p class="hint">لا توجد فيديوهات حتى الآن. كن أول من ينشر فيديو!</p>';return;}
   snap.forEach(v=>{const d=v.data(); feed.append(makeCard(v.id,d));});
 },err=>{$('feed').innerHTML=`<p class="msg">تعذر تحميل الفيديوهات: ${escapeHtml(err.message)}</p>`;});
}
function makeCard(id,d){
 const card=document.createElement('article');card.className='video-card';
 const video=document.createElement('video');video.src=d.videoUrl;video.controls=true;video.playsInline=true;video.preload='metadata';
 const meta=document.createElement('div');meta.className='video-meta';
 const author=document.createElement('small');author.textContent='@'+(d.email||'مستخدم').split('@')[0];
 const caption=document.createElement('p');caption.textContent=d.caption||'';
 const actions=document.createElement('div');actions.className='video-actions';
 const like=document.createElement('button');like.textContent=`♥ إعجاب (${d.likesCount||0})`;
 like.onclick=async()=>{
   if(!currentUser)return alert('سجّل الدخول للإعجاب.');
   const likeRef=doc(db,'videos',id,'likes',currentUser.uid);
   try{
    const existing=await getDoc(likeRef);
    if(existing.exists()){await deleteDoc(likeRef);await setDoc(doc(db,'videos',id),{likesCount:Math.max(0,(d.likesCount||0)-1)},{merge:true});}
    else{await setDoc(likeRef,{uid:currentUser.uid,createdAt:serverTimestamp()});await setDoc(doc(db,'videos',id),{likesCount:(d.likesCount||0)+1},{merge:true});}
   }catch(e){alert('تعذر تسجيل الإعجاب: '+e.message);}
 };
 const share=document.createElement('button');share.textContent='↗ مشاركة';share.onclick=async()=>{try{await navigator.share({title:'FayezTok',text:d.caption||'شاهد هذا الفيديو',url:d.videoUrl});}catch(e){if(e.name!=='AbortError')prompt('انسخ رابط الفيديو:',d.videoUrl);}};
 actions.append(like,share);meta.append(author,caption,actions);card.append(video,meta);return card;
}
function safeName(s){return s.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-90)||'video.mp4';}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function authError(e){const map={'auth/email-already-in-use':'هذا البريد مسجل مسبقًا.','auth/invalid-email':'صيغة البريد غير صحيحة.','auth/weak-password':'كلمة المرور ضعيفة.','auth/invalid-credential':'البريد أو كلمة المرور غير صحيحة.','auth/network-request-failed':'تحقق من اتصال الإنترنت.'};return map[e.code]||e.message;}