# 🏠 VeriHouse (베리하우스)

VeriHouse는 부동산 매물 정보와 **건축물대장 10종 데이터**를 한 번에 조회하고 비교 검증할 수 있는 통합 솔루션입니다. 

---

## 🎯 서비스 목적
부동산 거래 시, 실제 건축물대장과 매물 정보가 일치하는지 확인하는 것은 매우 중요합니다. 하지만 건축물대장은 표제부, 전유부, 층별개요, 지역지구구역 등 10종류로 나뉘어 있어 일반인이 일일이 발급받고 확인하기 매우 번거롭습니다.

VeriHouse는 주소 하나만 입력하면 **국가 오픈 API**를 활용하여:
1. 10종의 건축물대장 데이터를 한 번에 가져옵니다.
2. 직관적인 대시보드 UI를 통해 건물의 용도, 불법 건축물 여부, 주차장, 승강기, 지역지구구역 등을 한눈에 보여줍니다.
3. **도로명 주소**를 입력해도 행정안전부 주소 API를 통해 정확한 지번으로 자동 변환하여 빈틈없이 조회합니다.

---

## ⚙️ 설치 방법

VeriHouse는 Python(FastAPI) 백엔드와 React(Vite) 프론트엔드로 구성되어 있습니다. 아래 순서대로 누구나 쉽게 설치할 수 있습니다.

### 1. 사전 준비물 (Prerequisites)
- **Python 3.10 이상** 설치
- **Node.js 18 이상** 설치
- 공공데이터포털 건축물대장 API 키 발급
- 행정안전부(juso.go.kr) 도로명주소 검색 API 키 발급

### 2. 저장소 복제 (Clone)
```bash
git clone https://github.com/21ckorea/VeriHouse.git
cd VeriHouse
```

### 3. 환경 변수 설정 (.env)
`backend` 폴더 안에 `.env` 파일을 생성하고 발급받은 API 키와 서버 설정을 입력합니다.

> **⚠️ JUSO API(행정안전부 주소 API) 발급 시 주의사항**
> - **로컬 개발 시**: 서비스 용도를 `개발(본인인증없이 발급)`로 선택하여 즉시 발급받아 사용합니다. (90일 제한)
> - **실제 서버 배포 시 (정식 키)**: 서비스 용도를 **`운영`**으로 선택하고, 실제 서버의 도메인(또는 IP)을 입력한 뒤 **본인인증(휴대폰 등)**을 거쳐 영구적인 정식 승인키를 발급받아야 합니다.

```bash
# backend/.env

# API Keys
PUBLIC_DATA_SERVICE_KEY=공공데이터포털_건축물대장_인코딩키
JUSO_API_KEY=행정안전부_도로명주소_승인키
SCRAPER_API_KEY=스크래퍼API_우회키_없으면_빈칸

# Server Configuration (배포 시 변경)
SERVER_IP=localhost
BACKEND_PORT=8000
FRONTEND_PORT=5173
```
> **💡 서버 배포 시 네이버 부동산 차단(Timeout) 우회하기**
> 오라클 클라우드나 AWS 등 데이터센터 IP에서는 네이버가 접속을 원천 차단합니다. 이를 우회하려면 무료 프록시 API인 **ScraperAPI**를 사용해야 합니다.
> 1. [ScraperAPI](https://www.scraperapi.com) 에 접속하여 회원가입 (매월 1,000건 무료)
> 2. 대시보드에서 제공하는 **API Key** 복사
> 3. 위 `.env` 파일의 `SCRAPER_API_KEY` 항목에 붙여넣기 후 서버 재시작

> **💡 서버에 배포하거나 포트를 변경하려면?**
> 위 `.env` 파일의 `SERVER_IP`, `BACKEND_PORT`, `FRONTEND_PORT` 값만 한 번 수정해 주시면, 백엔드와 프론트엔드 연동에 필요한 모든 포트와 IP가 **자동으로 적용**됩니다! (수정 후 `./start.sh` 재실행)

### 4. 패키지 설치
**백엔드 설치**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # 윈도우는 venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

**프론트엔드 설치**
```bash
cd frontend
npm install
cd ..
```

---

## 🚀 실행 및 사용 방법

설치가 완료되었다면, 프로젝트 최상위 폴더에서 아래 명령어 하나만 실행하면 설정한 IP와 포트로 백엔드/프론트엔드가 동시에 실행됩니다.

```bash
# Mac / Linux
./start.sh
```

*(윈도우(Windows) 사용자는 `backend`와 `frontend` 폴더에서 각각 서버를 개별 실행해 주셔야 합니다.)*

### 브라우저 접속
- 실행 후 웹 브라우저를 열고 설정한 **`http://{SERVER_IP}:{FRONTEND_PORT}`** 에 접속합니다.
- (기본값: `http://localhost:5173`)

### 주소 조회해보기
1. 메인 화면의 검색창에 **도로명 주소** 또는 **지번 주소**를 입력합니다.
   - 예시: `대구광역시 동구 파계로112길 41` 또는 `대구 동구 중대동 453-2`
2. **조회** 버튼을 누릅니다.
3. 화면에 해당 주소의 **건물 개요, 층별 정보, 주차/승강기 정보, 오수정화시설, 지역/지구/구역** 정보가 깔끔한 카드로 표시됩니다.
4. 필요시 우측 상단의 **PDF 다운로드** 버튼을 눌러 레포트로 저장할 수도 있습니다.

---

## 🔄 업데이트 (최신 코드 반영하기)

개발 PC에서 수정하여 GitHub에 올라간 최신 코드를 운영 서버에 반영하려면, 서버 터미널에서 다음 명령어를 실행하세요.

```bash
# 1. 서버에 접속하여 프로젝트 폴더로 이동
cd VeriHouse

# 2. GitHub에서 최신 변경사항 내려받기
git pull origin main

# 3. 만약 패키지가 추가되었다면 설치 업데이트 (선택사항)
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# 4. 서버 재시작
./start.sh
```
