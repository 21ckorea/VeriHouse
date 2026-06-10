#!/bin/bash

# Color codes for pretty terminal logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo -e "=================================================================="
echo -e "         VeriHouse - 매물 & 건축물대장 검증 솔루션 시작기         "
echo -e "=================================================================="
echo -e "${NC}"

# Exit script if any process fails
trap "kill 0" EXIT

# 1. Start Backend FastAPI
echo -e "${BLUE}[1/2] FastAPI 백엔드 서버를 시작합니다... (Port: 8000)${NC}"
cd backend
./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait 2 seconds for backend to start
sleep 2

# 2. Start Frontend Vite
echo -e "${CYAN}[2/2] React 프론트엔드 개발 서버를 시작합니다... (Port: 5173)${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "${YELLOW}"
echo -e "------------------------------------------------------------------"
echo -e "🚀 서비스 구동 완료! 아래 링크로 브라우저에서 접속하세요:"
echo -e "   👉 백엔드 API 서버: ${GREEN}http://localhost:8000${YELLOW}"
echo -e "   👉 프론트엔드 대시보드: ${GREEN}http://localhost:5173${YELLOW}"
echo -e ""
echo -e "   * 빠른 테스트를 위해 데모 모드가 기본 탑재되어 있습니다."
echo -e "   * 종료하시려면 터미널에서 ${RED}Ctrl + C${YELLOW}를 입력해 주세요."
echo -e "------------------------------------------------------------------"
echo -e "${NC}"

# Keep script running to maintain child processes
wait
