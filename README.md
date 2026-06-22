# Counselor Profile

상담사가 직접 공개 프로필을 작성하고, 사용자가 만족도 평가를 남길 수 있는 Vite + React 앱입니다. 여러 상담사를 추가하고 상담사별 암호, 프로필, 평가를 따로 관리할 수 있습니다.

## Local

```bash
npm install
npm run dev
```

Vite 로컬 서버에서는 `/api/profile`이 없으면 자동으로 브라우저 localStorage에 저장됩니다.

## Vercel + Firebase

Vercel 배포 환경변수에 아래 값을 추가하면 `api/profile.ts`가 Firebase Firestore REST API에 저장합니다.

```text
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_DATABASE_ID=(default)
```

`FIREBASE_PRIVATE_KEY`는 서비스 계정 JSON의 `private_key` 값을 넣고, 줄바꿈은 `\n` 그대로 두면 됩니다.

Firestore 문서는 `counselorProfiles/main` 하나를 사용하고, 내부에 상담사 배열을 저장합니다. 공개 조회 응답에는 암호 해시가 포함되지 않고, 각 상담사 프로필 수정 시에만 해당 상담사의 암호를 확인합니다.
