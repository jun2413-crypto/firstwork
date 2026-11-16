// ───────────────────────────────────────────────────────────────
// 가족 동기화 엔진 (2차)
//
// 두 대의 휴대폰(부모 계정 2개)이 같은 미술관을 보도록 Firebase로
// 양방향 동기화한다. 작품 메타데이터는 Firestore, 사진·목소리 파일은
// Cloud Storage에 둔다. 충돌은 updatedAt 기준 '나중에 고친 쪽이 이김'.
//
// firebase-config.js의 apiKey가 비어 있으면 이 파일은 아무 것도 하지
// 않는다. 그 경우 앱은 로컬 전용으로 그대로 동작한다.
// ───────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var CFG = window.FIREBASE_CONFIG;
  if (!CFG || !CFG.apiKey) return; // 설정 전 → 로컬 전용

  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var EMAILS = (window.FAMILY_EMAILS || []).map(function (e) { return String(e).toLowerCase(); });
  var WORKS = 'museum_works', META = 'museum_meta';

  var fb = {}, auth = null, db = null, st = null;
  var user = null, started = false, loading = false;
  var remoteMap = {}, pushTimer = 0, pushing = false, uploaded = {};

  function bridge() { return window.MuseumBridge; }
  function ready() { return !!(bridge() && bridge().store); }

  // ---- UI (설정 화면의 '가족 동기화' 칸) ----
  function setStatus(tag, info) {
    var b = bridge(); if (!b) return;
    if (tag != null && b.ui.tag()) b.ui.tag().textContent = tag;
    if (info != null && b.ui.info()) b.ui.info().textContent = info;
  }
  function renderUI() {
    var b = bridge(); if (!b) return;
    var btn = b.ui.btn(); if (!btn) return;
    btn.hidden = false;
    if (user) {
      setStatus('켜짐', '이 미술관은 ' + user.email + ' 계정으로 ' + EMAILS.length + '개 기기와 동기화됩니다. 새 작품과 수정이 자동으로 오갑니다.');
      btn.textContent = '로그아웃';
      btn.onclick = function () { signOutNow(); };
    } else {
      setStatus('꺼짐', '부부 두 사람의 휴대폰이 같은 미술관을 보도록 로그인하세요. firebase-config.js에 적은 구글 계정만 됩니다.');
      btn.textContent = '가족 동기화 로그인';
      btn.onclick = function () { signIn(); };
    }
  }

  // ---- Firebase SDK 로드 ----
  function loadSDK() {
    if (loading) return loading;
    loading = Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
      import(SDK + 'firebase-storage.js')
    ]).then(function (m) {
      fb.app = m[0]; fb.auth = m[1]; fb.fs = m[2]; fb.st = m[3];
      var app = fb.app.initializeApp(CFG);
      auth = fb.auth.getAuth(app);
      db = fb.fs.getFirestore(app);
      st = fb.st.getStorage(app);
      return fb.auth.getRedirectResult(auth).catch(function () {}).then(function () {
        fb.auth.onAuthStateChanged(auth, onAuth);
      });
    }).catch(function (e) {
      loading = false;
      setStatus('오류', '동기화 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요. (' + (e && e.message || e) + ')');
      throw e;
    });
    return loading;
  }

  function signIn() {
    setStatus('연결 중…', '구글 로그인 창을 여는 중입니다.');
    loadSDK().then(function () {
      var prov = new fb.auth.GoogleAuthProvider();
      return fb.auth.signInWithPopup(auth, prov).catch(function (e) {
        // 모바일/PWA에서 팝업이 막히면 리디렉션으로
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/cancelled-popup-request')) {
          return fb.auth.signInWithRedirect(auth, prov);
        }
        throw e;
      });
    }).catch(function (e) {
      setStatus('오류', '로그인하지 못했습니다: ' + (e && e.code || e));
    });
  }
  function signOutNow() {
    if (!auth) return;
    fb.auth.signOut(auth).then(function () { renderUI(); });
  }

  function onAuth(u) {
    if (u && EMAILS.indexOf(String(u.email).toLowerCase()) < 0) {
      // 허가되지 않은 계정
      setStatus('거부', u.email + ' 은(는) 등록된 가족 계정이 아닙니다. firebase-config.js의 FAMILY_EMAILS를 확인하세요.');
      fb.auth.signOut(auth);
      user = null; return;
    }
    user = u || null;
    renderUI();
    if (user) start();
    else { started = false; }
  }

  // ---- 저장소 경로 ----
  function wref(id) { return fb.fs.doc(db, WORKS, id); }
  function sref(path) { return fb.st.ref(st, path); }
  async function downloadBlob(path) {
    var url = await fb.st.getDownloadURL(sref(path));
    var r = await fetch(url);
    if (!r.ok) throw new Error('download ' + r.status);
    return await r.blob();
  }

  // ---- 시작: 아이 정보 맞추고, 작품 컬렉션을 실시간 구독 ----
  async function start() {
    if (started || !ready()) return;
    started = true;
    setStatus('동기화 중…', '미술관을 맞추는 중입니다.');
    try {
      var snap = await fb.fs.getDoc(fb.fs.doc(db, META, 'child'));
      var rc = snap.exists() ? snap.data() : null;
      var lc = bridge().child;
      if (rc && (!lc || (rc.updatedAt || 0) > (lc.updatedAt || 0))) {
        await bridge().applyRemoteChild(rc);
      } else if (lc && (!rc || (lc.updatedAt || 0) > (rc.updatedAt || 0))) {
        await fb.fs.setDoc(fb.fs.doc(db, META, 'child'), stripChild(lc), { merge: true });
      }
    } catch (e) { console.warn('child sync', e); }

    fb.fs.onSnapshot(fb.fs.collection(db, WORKS), async function (qs) {
      remoteMap = {};
      qs.forEach(function (d) { remoteMap[d.id] = d.data(); });
      try { await reconcile(); await pushAll(); renderUI(); }
      catch (e) { console.warn('reconcile', e); }
    }, function (err) {
      setStatus('오류', '동기화 오류: ' + err.code + '. 보안 규칙에 두 계정을 넣었는지 확인하세요.');
    });
  }

  function stripChild(c) { return { id: c.id, name: c.name, birth: c.birth, createdAt: c.createdAt || Date.now(), updatedAt: c.updatedAt || Date.now() }; }

  // ---- 원격 → 로컬 ----
  async function reconcile() {
    var store = bridge().store;
    var localRaw = await store.listWorks(); // 툼스톤 포함
    var localMap = {};
    localRaw.forEach(function (w) { localMap[w.id] = w; });
    var changed = false;

    for (var id in remoteMap) {
      var r = remoteMap[id], l = localMap[id];
      if (r.deleted) {
        if ((!l || !l.deleted) && (r.updatedAt || 0) >= ((l && l.updatedAt) || 0)) {
          await store.putWork({ id: id, childId: (bridge().child || {}).id, deleted: true, createdAt: r.createdAt || Date.now(), updatedAt: r.updatedAt || Date.now() });
          bridge().dropUrls(id); changed = true;
        }
        continue;
      }
      if (!l || (!l.deleted && (r.updatedAt || 0) > (l.updatedAt || 0)) || (l.deleted && (r.updatedAt || 0) > (l.updatedAt || 0))) {
        try {
          var image = await downloadBlob(r.imagePath);
          var thumb = r.thumbPath ? await downloadBlob(r.thumbPath) : image;
          var audio = r.hasAudio && r.audioPath ? await downloadBlob(r.audioPath) : null;
          await store.putWork({
            id: id, childId: (bridge().child || {}).id, title: r.title || '', madeAt: r.madeAt,
            frame: r.frame || 'wood', w: r.w, h: r.h, createdAt: r.createdAt || Date.now(),
            updatedAt: r.updatedAt || Date.now(), image: image, thumb: thumb, audio: audio, deleted: false
          });
          bridge().dropUrls(id);
          uploaded[id] = r.updatedAt || 0; // 방금 맞췄으니 다시 올릴 필요 없음
          changed = true;
        } catch (e) { console.warn('pull blob', id, e); }
      }
    }
    if (changed) await bridge().reloadFromStore();
  }

  // ---- 로컬 → 원격 ----
  async function pushAll() {
    if (pushing) return; pushing = true;
    try {
      var store = bridge().store;
      var localRaw = await store.listWorks();
      // 아이 정보
      var lc = bridge().child;
      if (lc) {
        var rcu = (remoteMap.__child && remoteMap.__child.updatedAt) || 0;
      }
      for (var i = 0; i < localRaw.length; i++) {
        var l = localRaw[i], r = remoteMap[l.id];
        var newer = !r || (l.updatedAt || 0) > (r.updatedAt || 0);
        if (!newer) continue;
        if (l.deleted) {
          await fb.fs.setDoc(wref(l.id), { deleted: true, childId: l.childId || (lc && lc.id) || '', createdAt: l.createdAt || Date.now(), updatedAt: l.updatedAt || Date.now() }, { merge: true });
          continue;
        }
        if (uploaded[l.id] === (l.updatedAt || 0)) continue; // 이번 세션에 이미 올림
        var base = 'museum/' + l.id + '/';
        var audioPath = null;
        await fb.st.uploadBytes(sref(base + 'image.jpg'), l.image);
        await fb.st.uploadBytes(sref(base + 'thumb.jpg'), l.thumb);
        if (l.audio) { audioPath = base + 'audio.' + bridge().audioExt(l.audio); await fb.st.uploadBytes(sref(audioPath), l.audio); }
        await fb.fs.setDoc(wref(l.id), {
          childId: l.childId || (lc && lc.id) || '', title: l.title || '', madeAt: l.madeAt,
          frame: l.frame || 'wood', w: l.w, h: l.h, createdAt: l.createdAt || Date.now(), updatedAt: l.updatedAt || Date.now(),
          deleted: false, hasAudio: !!l.audio, imagePath: base + 'image.jpg', thumbPath: base + 'thumb.jpg', audioPath: audioPath
        });
        uploaded[l.id] = l.updatedAt || 0;
      }
    } finally { pushing = false; }
  }

  // 외부(앱)에서 로컬 변경 후 호출. 디바운스.
  function push() {
    if (!user || !started) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      // 아이 정보도 함께 반영
      var lc = bridge().child;
      if (lc) fb.fs.setDoc(fb.fs.doc(db, META, 'child'), stripChild(lc), { merge: true }).catch(function () {});
      pushAll().catch(function (e) { console.warn('push', e); });
    }, 900);
  }

  // 앱에 연결
  var attach = setInterval(function () {
    if (!bridge()) return;
    clearInterval(attach);
    bridge().sync = { push: push, renderUI: renderUI, start: function () { if (user) start(); }, get active() { return !!user; } };
    renderUI();
    // 이전에 로그인해 둔 세션이 있으면 자동으로 이어서 동기화
    loadSDK().catch(function () {});
  }, 120);
})();
