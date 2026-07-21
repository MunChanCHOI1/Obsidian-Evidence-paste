# Obsidian-Evidence-paste
옵시디언 증적 복붙 플러그인 

## 로컬 폴더 업로드 방법

아래 순서로 로컬 폴더를 이 저장소에 올릴 수 있습니다.

```bash
cd /path/to/your/local-folder
git init
git remote add origin https://github.com/MunChanCHOI1/Obsidian-Evidence-paste.git
git add .
git commit -m "Upload local folder"
git branch -M main
git push -u origin main
```

이미 Git 저장소라면 `git init`/`git remote add` 는 생략하고 `git add`, `git commit`, `git push` 만 진행하면 됩니다.
