# 첫 미술관 (설치형 웹앱)

이 폴더를 HTTPS 정적 호스팅에 그대로 올리면 됩니다. 서버 코드는 없습니다.

1. PC에서 Netlify Drop(app.netlify.com/drop) 또는 GitHub Pages, Cloudflare Pages 중 하나에 이 폴더 전체를 올립니다.
2. 발급된 https 주소를 안드로이드 Chrome에서 엽니다.
3. Chrome 메뉴 > "홈 화면에 추가"(또는 앱 설정 화면의 "설치하기")를 누릅니다.

- 작품 사진과 목소리는 호스팅 서버로 올라가지 않고 휴대폰 브라우저 저장소(IndexedDB)에만 저장됩니다.
- Chrome의 사이트 데이터를 지우면 작품도 지워집니다. 설정 > 백업에서 주기적으로 ZIP을 받아 두세요.
- 파일을 고친 뒤에는 sw.js 의 CACHE 값을 v2, v3 으로 올려야 휴대폰에 새 버전이 반영됩니다.
- 2차(가족 공유 링크·방명록): index.html 의 LocalStore 와 같은 메서드를 가진 RemoteStore 를 추가해 연결합니다.
