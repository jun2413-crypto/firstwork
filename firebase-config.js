// ───────────────────────────────────────────────────────────────
// 가족 동기화 설정 파일
//
// 이 파일을 채우면 동기화가 켜지고, 비워 두면 앱은 지금처럼
// 이 휴대폰 안에서만 동작합니다(사진이 밖으로 나가지 않습니다).
//
// 채우는 방법은 함께 드린 FIREBASE-SETUP.md 를 따라 하세요.
// ───────────────────────────────────────────────────────────────

// 1) Firebase 콘솔 > 프로젝트 설정 > "내 앱"의 웹 앱 구성(firebaseConfig)을
//    통째로 복사해 아래에 붙여 넣으세요. apiKey 가 비어 있으면 동기화는 꺼집니다.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAuWyj1ALXydYGcwjPRNb7uPmC_5Ujq6tY",
  authDomain: "hari-museum.firebaseapp.com",
  projectId: "hari-museum",
  storageBucket: "hari-museum.firebasestorage.app",
  appId: "1:946392823579:web:d3ea439c2e06a5b30e85be"
};

// 2) 미술관에 접근할 수 있는 부모 두 사람의 구글 계정 이메일.
//    여기에 적은 계정만 로그인해 작품을 보고 올릴 수 있습니다.
//    (보안의 실제 경계는 firestore.rules / storage.rules 이며, 그 두 파일에도
//     똑같은 이메일을 적어야 합니다.)
window.FAMILY_EMAILS = [
  "junhyuk2413@gmail.com",
  "junjudragon@gmail.com"
];
