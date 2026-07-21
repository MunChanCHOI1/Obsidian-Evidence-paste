# 테스트 가이드

이 플러그인은 순수 로직(증적 번호, 파일명, 마크다운 안전 처리, MIME, 템플릿 렌더)을
Obsidian API와 분리해 작성했기 때문에, 브라우저/Obsidian 없이 헤드리스로 검증할 수 있습니다.

## 1. 단위 테스트 (`npm test`)

`tests/` 아래의 `node:test` 기반 테스트를 [`tsx`](https://github.com/privatenumber/tsx)로 실행합니다.

```bash
npm install      # 최초 1회 (tsx 포함 devDependencies 설치)
npm test
```

커버리지 범위:

- `evidence-id` — 증적 번호 파싱/최댓값 탐색(접두사 경계 포함)/포맷/시퀀스
- `file-naming` — 타임스탬프 포맷, 파일명 조합, 경로 조합, 충돌 시 `_n` suffix, 유일 경로 해석
- `markdown` — 코드펜스 길이 안전화, HTML 주석 종료 무력화, 스칼라 정규화, 경고 목록 포맷
- `mime` — 지원 이미지 타입 판별/확장자 매핑/파라미터·대소문자 정규화
- `template-renderer` — 이미지 임베드, 기본 템플릿 조합, 변수 치환(콜아웃 연속 줄 접두사),
  전체 블록 렌더, 사용자 정의 템플릿 우선/공백 시 fallback

AI가 없으므로 프로즈 필드는 모두 "직접 작성 필요" 플레이스홀더로, `증적 유형`은 "스크린샷"
기본값으로 렌더되는지 확인합니다.

## 2. 타입 검사

- 클라우드/무의존성 strict 검사(핸드로 작성한 obsidian 스텁 사용):

  ```bash
  npm run check:cloud     # tsc --noEmit -p tsconfig.check.json
  ```

- 실제 빌드 시 검사(설치된 `obsidian` 패키지 타입 사용):

  ```bash
  npm run build           # tsc -noEmit -skipLibCheck && esbuild(production)
  ```

## 3. Obsidian 수동 점검 체크리스트

빌드(`npm run build`) 후 플러그인을 리로드하고 다음을 확인합니다.

1. 스크린샷을 노트에 붙여넣기 → 첨부 폴더에 `EV-00X_YYYYMMDD_HHmmss.png`로 저장되고,
   커서 위치에 `### 증적`, 이미지 임베드, 설명 콜아웃이 삽입되는지.
2. 같은 노트에 이미지를 여러 장 연속 붙여넣기 → 증적 번호가 순차 증가하는지.
3. 텍스트만 붙여넣기 → Obsidian 기본 동작을 방해하지 않는지.
4. 명령 팔레트의 "Insert empty evidence template" → 이미지 없이 빈 템플릿이 삽입되는지.
5. 설정 탭에서 접두사/자릿수/이미지 너비/콜아웃 종류/토글/사용자 정의 템플릿 변경 시
   미리보기가 즉시 갱신되는지, "기본값으로 초기화"가 2클릭 확인으로 동작하는지.
