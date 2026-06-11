import os
import sys
import logging
import requests as std_requests
import urllib.parse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add current directory (app) to system path to resolve 'services' imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.naver_scraper import NaverLandScraper
from services.matcher import DiscrepancyMatcher
from services.history import HistoryService

logger = logging.getLogger(__name__)

app = FastAPI(
    title="VeriHouse API",
    description="네이버 부동산 매물 & 건축물대장 정합성 비교 분석 API 서비스",
    version="2.0.0"
)

# Enable CORS for React frontend (development and production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Services
scraper = NaverLandScraper()
history_service = HistoryService()
matcher = DiscrepancyMatcher()

# Public Data API Service Key (env or default)
_DEFAULT_SERVICE_KEY = os.getenv(
    "PUBLIC_DATA_SERVICE_KEY",
    "ec3leowa2E+pq0TU0rbV6iWpe4pw5PNVo5uNkQRHBx/0JmWWA4oodvThGy1cZ5mlpEkU0qSdU1CJxnacMZJRfg=="
)


# ── Pydantic 스키마 ─────────────────────────────────────────────
class VerificationRequest(BaseModel):
    url_or_id: str = Field(..., description="네이버 부동산 매물 URL 또는 10자리 매물 ID")
    service_key: Optional[str] = Field(None, description="공공데이터포털 건축물대장 API 인증키 (생략 시 환경변수 사용)")


def fetch_building_ledger_by_pnu(pnu: str, service_key: str) -> Dict[str, Any]:
    """
    PNU 코드에서 시군구/법정동/본번/부번을 추출하여 건축물대장 10개 API를 호출하고 결과를 반환합니다.
    """
    if not pnu or len(pnu) != 19:
        return {
            "demo_mode": True,
            "title_info": [],
            "exclusive_info": [],
            "error": "PNU 코드가 없거나 형식이 잘못되었습니다."
        }

    sigungu_cd = pnu[:5]
    bjdong_cd  = pnu[5:10]

    # PNU 11번째 자리 → platGbCd 매핑 (1=대지→0, 2=산→1, 3=블록→2)
    pnu_plat = pnu[10]
    plat_gb_cd = {"1": "0", "2": "1", "3": "2"}.get(pnu_plat, "0")

    bun = pnu[11:15]   # 본번 4자리
    ji  = pnu[15:19]   # 부번 4자리

    encoded_key = urllib.parse.quote(service_key, safe="")
    base_url = "https://apis.data.go.kr/1613000/BldRgstHubService"

    endpoints = {
        "title": "getBrTitleInfo",                  # 1. 표제부
        "basis": "getBrBasisOulnInfo",              # 2. 기본개요
        "floor": "getBrFlrOulnInfo",                # 3. 층별개요
        "expos_pubuse": "getBrExposPubuseAreaInfo",  # 4. 전유공용면적
        "hs_price": "getBrHsprcInfo",               # 5. 주택가격
        "expos": "getBrExposInfo",                  # 6. 전유부
        "wclf": "getBrWclfInfo",                    # 7. 오수정화시설
        "recap": "getBrRecapTitleInfo",             # 8. 총괄표제부
        "atch_jibun": "getBrAtchJibunInfo",         # 9. 부속지번
        "jijigu": "getBrJijiguInfo",                # 10. 지역지구구역
    }

    results = {}
    for key, method in endpoints.items():
        url = (
            f"{base_url}/{method}?"
            f"sigunguCd={sigungu_cd}&bjdongCd={bjdong_cd}&platGbCd={plat_gb_cd}"
            f"&bun={bun}&ji={ji}&numOfRows=100&pageNo=1&_type=json&serviceKey={encoded_key}"
        )
        try:
            resp = std_requests.get(url, timeout=10)
            items_list = []
            if resp.status_code == 200:
                data = resp.json()
                body = data.get("response", {}).get("body", {})
                rc   = data.get("response", {}).get("header", {}).get("resultCode", "")
                if rc == "00":
                    items_raw = body.get("items", {})
                    items = items_raw.get("item", []) if items_raw else []
                    if isinstance(items, dict):
                        items = [items]
                    items_list = items
            results[key] = items_list
        except Exception as e:
            logger.error(f"Error fetching {method}: {e}")
            results[key] = []

    # 표제부를 matcher가 기존에 사용하던 형태로 변환
    title_list = results.get("title", [])
    def _to_title_dict(item: dict) -> dict:
        tot_pkng = item.get("totPkngCnt")
        if tot_pkng is None or str(tot_pkng).strip() == "" or float(tot_pkng) == 0:
            tot_pkng = (
                float(item.get("indrAutoUtcnt", 0) or 0) +
                float(item.get("oudrAutoUtcnt", 0) or 0) +
                float(item.get("indrMechUtcnt", 0) or 0) +
                float(item.get("oudrMechUtcnt", 0) or 0)
            )
        return {
            "bldNm":          item.get("bldNm", ""),
            "platPlc":        item.get("platPlc", ""),
            "newPlatPlc":     item.get("newPlatPlc", ""),
            "violBldYn":      item.get("violBldYn", "N"),
            "grndFlrCnt":     item.get("grndFlrCnt", 0),
            "ugrndFlrCnt":    item.get("ugrndFlrCnt", 0),
            "totPkngCnt":     float(tot_pkng or 0),
            "useAprvDay":     item.get("useAprDay", ""),
            "mainPurpsCdNm":  item.get("mainPurpsCdNm", ""),
            "platArea":       float(item.get("platArea", 0.0) or 0.0),
            "totArea":        float(item.get("totArea", 0.0) or 0.0),
            "archArea":       float(item.get("archArea", 0.0) or 0.0),
            "strctCdNm":      item.get("strctCdNm", ""),
            "etcStrct":       item.get("etcStrct", ""),
            "hhldCnt":        item.get("hhldCnt", 0),
            "crtnDay":        item.get("crtnDay", ""),
            "vlRat":          float(item.get("vlRat", 0.0) or 0.0),
            "bcRat":          float(item.get("bcRat", 0.0) or 0.0),
            "regstrGbCdNm":   item.get("regstrGbCdNm", ""),
            "regstrKindCdNm": item.get("regstrKindCdNm", ""),
        }

    # expos_pubuse 또는 expos에서 호실정보 구축
    excl_list = []
    raw_excl = results.get("expos_pubuse", []) or results.get("expos", [])
    def _to_excl_dict(item: dict) -> dict:
        flr_raw = item.get("flrNo", "")
        if isinstance(flr_raw, (int, float)):
            flr_str = f"{int(flr_raw)}층"
        else:
            flr_str = str(flr_raw).strip()
            if flr_str and not flr_str.endswith("층"):
                flr_str = flr_str + "층"
        return {
            "flrNm":         flr_str,
            "hoNm":          str(item.get("hoNm", "") or ""),
            "mainPurpsCdNm": str(item.get("mainPurpsCdNm", "") or ""),
            "exposSpc":      float(item.get("area", 0.0) or item.get("exposSpc", 0.0) or 0.0),
            "strctCdNm":     str(item.get("strctCdNm", "") or ""),
        }

    return {
        "demo_mode": False,
        "pnu": pnu,
        "sigungu_code": sigungu_cd,
        "bdong_code": bjdong_cd,
        "title_info": [_to_title_dict(x) for x in title_list],
        "exclusive_info": [_to_excl_dict(x) for x in raw_excl],
        "raw_title": title_list,
        "raw_exclusive": raw_excl,
        # 추가 수집한 원본 데이터 목록 전체 탑재
        "all_raw_data": results
    }


# ── API 엔드포인트 ───────────────────────────────────────────────
@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "VeriHouse API v2",
        "description": "네이버 부동산 매물 & 건축물대장 정합성 분석 서비스가 정상 구동 중입니다."
    }


@app.post("/api/verify")
def verify_listing(payload: VerificationRequest):
    """
    매물번호 또는 URL로 네이버 부동산 매물을 수집하고,
    PNU 코드를 동적으로 추출하여 건축물대장과 비교 분석합니다.
    """
    url_or_id = payload.url_or_id
    service_key = payload.service_key or _DEFAULT_SERVICE_KEY

    # 1. Naver 매물 정보 수집 (PNU 동적 추출 포함)
    naver_res = scraper.get_article_details(url_or_id)
    if not naver_res.get("success"):
        raise HTTPException(status_code=400, detail=naver_res.get("message", "네이버 매물 파싱에 실패했습니다."))

    pnu_code = naver_res.get("pnu_code", "")

    # 2. PNU 기반 건축물대장 직접 조회
    if pnu_code and service_key:
        ledger_res = fetch_building_ledger_by_pnu(pnu_code, service_key)
    else:
        ledger_res = {
            "demo_mode": True,
            "title_info": [],
            "exclusive_info": [],
            "error": "PNU 코드 또는 서비스 키가 없어 건축물대장 조회를 건너뜁니다."
        }

    # 3. 정합성 분석
    report = matcher.verify(naver_res, ledger_res)

    # 4. 검증 이력 저장
    history_service.add_record(
        article_no=naver_res["article_no"],
        title=naver_res.get("title", ""),
        property_type=naver_res.get("property_type", ""),
        trade_type=naver_res.get("trade_type", ""),
        price_info=naver_res.get("price_info", {}),
        address=naver_res.get("address", ""),
        risk_score=report["risk_score"],
        risk_level=report["risk_level"]
    )

    # 5. 응답 구성
    building_info = naver_res.get("building_info", {})
    return {
        "listing_details": {
            "article_no":       naver_res["article_no"],
            "pnu_code":         pnu_code,
            "title":            naver_res.get("title", ""),
            "property_type":    naver_res.get("property_type", ""),
            "property_type_code": naver_res.get("property_type_code", ""),
            "trade_type":       naver_res.get("trade_type", ""),
            "price_info":       naver_res.get("price_info", {}),
            "floor_info":       naver_res.get("floor_info", ""),
            "area_exclusive":   naver_res.get("area_exclusive", 0),
            "area_supply":      naver_res.get("area_supply", 0),
            "area_land":        naver_res.get("area_land", 0),
            "area_total":       naver_res.get("area_total", 0),
            "room_count":       naver_res.get("room_count", 0),
            "bathroom_count":   naver_res.get("bathroom_count", 0),
            "address":          naver_res.get("address", ""),
            "road_address":     naver_res.get("road_address", ""),
            "description":      naver_res.get("description", ""),
            "latitude":         naver_res.get("latitude", 0.0),
            "longitude":        naver_res.get("longitude", 0.0),
            "simulation_mode":  naver_res.get("simulation_mode", False),
            # 건축물 상세 (buildingRegistration API)
            "building_info":    building_info,
            # 중개사 / 교통 / 세금 / 수수료
            "agent":            naver_res.get("agent", {}),
            "transport":        naver_res.get("transport", {}),
            "tax_info":         naver_res.get("tax_info", {}),
            "agent_fee":        naver_res.get("agent_fee", {}),
        },
        "ledger_details": {
            "title_info":     ledger_res.get("title_info", []),
            "exclusive_info": ledger_res.get("exclusive_info", []),
            "raw_title":      ledger_res.get("raw_title", []),
            "raw_exclusive":  ledger_res.get("raw_exclusive", []),
            "demo_mode":      ledger_res.get("demo_mode", False),
            "sigungu_code":   ledger_res.get("sigungu_code", ""),
            "bdong_code":     ledger_res.get("bdong_code", ""),
            "pnu":            pnu_code,
            "error":          ledger_res.get("error"),
            "all_raw_data":   ledger_res.get("all_raw_data", {}),
        },
        "analysis_report": report
    }


@app.get("/api/history")
def get_verification_history(limit: int = 20):
    return history_service.get_history(limit=limit)


@app.get("/api/stats")
def get_stats():
    return history_service.get_stats()


# juso.go.kr 도로명주소 API Key
_JUSO_API_KEY = os.getenv("JUSO_API_KEY", "")


# ── Juso API: 도로명→지번 변환 ──────────────────────────────────
def _resolve_road_to_jibun_juso(address: str) -> Optional[Dict[str, str]]:
    """
    행정안전부(juso.go.kr) API를 사용하여 도로명주소를 지번주소로 변환합니다.
    Returns: {
        "jibun_address": "대구광역시 동구 중대동 453-2",
        "road_address":  "대구광역시 동구 파계로112길 41(중대동)",
        "sido": "대구광역시",
        "sigungu": "동구",
        "dong": "중대동",
        "bun": "453",
        "ji": "2",
    } 또는 None
    """
    juso_key = _JUSO_API_KEY
    if not juso_key:
        logger.warning("JUSO_API_KEY가 설정되지 않았습니다.")
        return None

    try:
        url = "https://business.juso.go.kr/addrlink/addrLinkApi.do"
        params = {
            "confmKey": juso_key,
            "currentPage": 1,
            "countPerPage": 10,
            "keyword": address,
            "resultType": "json",
        }
        resp = std_requests.get(url, params=params, timeout=8)
        if resp.status_code != 200:
            logger.warning(f"Juso API 응답 실패: status={resp.status_code}")
            return None

        # Juso API는 괄호나 이상한 문자가 섞인 텍스트를 반환할 수 있으므로, json()이 실패하면 text를 정제해서 파싱할 수 있습니다.
        # 대체로 resultType=json이면 순수 JSON을 반환하지만, 만일을 위해 예외처리.
        data = resp.json()
        juso_list = data.get("results", {}).get("juso", [])
        
        if not juso_list:
            logger.info(f"Juso API 결과 없음: {address}")
            return None

        # 검색 결과의 첫 번째 항목 사용
        item = juso_list[0]
        
        jibun_addr = item.get("jibunAddr", "")
        road_addr = item.get("roadAddr", "")
        sido = item.get("siNm", "")
        sigungu = item.get("sggNm", "")
        dong = item.get("emdNm", "")
        bun = item.get("lnbrMnnm", "")
        ji = item.get("lnbrSlno", "")
        
        # lnbrSlno가 '0' 이면 부번이 없는 것이므로 빈 문자열 처리
        if ji == "0":
            ji = ""

        if dong and bun:
            result = {
                "jibun_address": jibun_addr,
                "road_address": road_addr,
                "sido": sido,
                "sigungu": sigungu,
                "dong": dong,
                "bun": str(bun).strip(),
                "ji": str(ji).strip(),
            }
            logger.info(f"Juso 도로명→지번 변환 성공: {address} → {jibun_addr}")
            return result

        return None
    except Exception as e:
        logger.warning(f"Juso API 호출 실패: {e}")
        return None


# ── Nominatim 지오코딩으로 법정동 이름 추출 (폴백) ────────────────────────
def _resolve_dong_from_nominatim(address: str) -> Optional[str]:
    """
    도로명주소를 Nominatim(OpenStreetMap) API에 질의하여
    법정동(동/읍/면/리) 이름을 추출합니다.
    예: '대구광역시 동구 용진길 14-18' → '중대동'
    """
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": address,
            "format": "jsonv2",
            "addressdetails": 1,
            "countrycodes": "kr",
            "accept-language": "ko",
            "limit": 1,
        }
        headers = {"User-Agent": "VeriHouse/1.0 (building-ledger-lookup)"}
        resp = std_requests.get(url, params=params, headers=headers, timeout=8)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data:
            return None

        addr = data[0].get("address", {})
        dong_candidates = [
            addr.get("suburb"),
            addr.get("quarter"),
            addr.get("village"),
            addr.get("hamlet"),
            addr.get("neighbourhood"),
        ]
        for candidate in dong_candidates:
            if candidate and candidate.endswith(("동", "읍", "면", "리")):
                return candidate
        return None
    except Exception as e:
        logger.warning(f"Nominatim geocoding 실패: {e}")
        return None

# ── 시군구 내 모든 법정동 순회 → 도로명 매칭 폴백 ─────────────────────────
def _find_bdong_by_road_scan(
    client,
    sigungu_code: str,
    road_name: str,
    bldg_token: str,
    service_key: str,
) -> tuple:
    """
    Nominatim이 법정동을 못 찾을 때 사용.
    시군구 내 모든 법정동을 순회하며 getBrTitleInfo를 호출하여
    newPlatPlc에 road_name + bldg_token이 포함된 건물이 있는 법정동을 찾습니다.

    Returns: (bdong_code: str, dong_name: str) 또는 (None, None)
    """
    import urllib.parse as _up
    df = client.bdong_df
    if df.empty:
        return None, None

    # 시군구코드로 필터 (동리명이 빈값인 읍면동 수준만)
    mask = (df["시군구코드"].astype(str) == str(sigungu_code)) & (df["동리명"] == "")
    dongs = df[mask].copy()
    # 전체 코드가 000000인 행(시군구 대표 행) 제외
    dongs = dongs[dongs["법정동코드"].astype(str).str[-5:] != "00000"]

    encoded_key = _up.quote(service_key, safe="")
    base_url = "https://apis.data.go.kr/1613000/BldRgstHubService"

    for _, row in dongs.iterrows():
        bdong_full = str(row["법정동코드"])
        bdong_cd   = bdong_full[5:10]          # 뒤 5자리 = bjdongCd
        dong_nm    = str(row["읍면동명"]).strip()

        url = (
            f"{base_url}/getBrTitleInfo?"
            f"sigunguCd={sigungu_code}&bjdongCd={bdong_cd}&platGbCd=0"
            f"&bun=&ji=&numOfRows=100&pageNo=1&_type=json&serviceKey={encoded_key}"
        )
        try:
            resp = std_requests.get(url, timeout=8)
            if resp.status_code != 200:
                continue
            data = resp.json()
            if data.get("response", {}).get("header", {}).get("resultCode") != "00":
                continue
            items_raw = data.get("response", {}).get("body", {}).get("items", {})
            items = items_raw.get("item", []) if items_raw else []
            if isinstance(items, dict):
                items = [items]
        except Exception as e:
            logger.warning(f"[road_scan] {dong_nm} 조회 실패: {e}")
            continue

        for item in items:
            road_addr = (item.get("newPlatPlc") or "").strip()
            match_road  = road_name  in road_addr if road_name  else False
            match_token = bldg_token in road_addr if bldg_token else False
            if match_road and match_token:
                logger.info(f"[road_scan] 매칭 → 법정동: {dong_nm}({bdong_cd}), 주소: {road_addr}")
                return bdong_cd, dong_nm

    return None, None


# ── 주소로 건축물대장 직접 조회 ────────────────────────────────────
class LedgerSearchRequest(BaseModel):
    address: str = Field(..., description="도로명주소 또는 지번주소 (예: 대구광역시 동구 중대동 422-2)")
    service_key: Optional[str] = None


@app.post("/api/ledger/by-address")
def search_ledger_by_address(payload: LedgerSearchRequest):
    """
    도로명 또는 지번주소를 받아 법정동코드를 조회하고,
    건축물대장 10종(표제부·기본개요·층별·전유 등)을 모두 반환합니다.
    """
    from services.public_data import PublicDataClient
    import urllib.parse

    service_key = payload.service_key or _DEFAULT_SERVICE_KEY
    address     = payload.address.strip()

    if not address:
        raise HTTPException(status_code=400, detail="주소를 입력해 주세요.")

    # 1. 주소 파싱 → 법정동 코드 조회
    client = PublicDataClient(service_key)
    try:
        parsed = client.parse_korean_address(address)
        was_road_name = False  # 도로명주소 여부 (나중에 필터링용)

        # ── 도로명주소 처리 ──────────────────────────────────────────
        if parsed.get("is_road_name") and not parsed.get("dong"):

            # 1차 시도: Juso API (도로명→지번 완전 변환)
            juso_result = _resolve_road_to_jibun_juso(address)
            if juso_result and juso_result.get("dong"):
                # Juso가 지번 주소를 완전 반환 → parsed를 지번으로 교체
                parsed["dong"]         = juso_result["dong"]
                parsed["bun"]          = juso_result.get("bun", "")
                parsed["ji"]           = juso_result.get("ji", "")
                parsed["is_road_name"] = False
                was_road_name = False  # 지번으로 완전 변환됨, 도로명 필터 불필요
                logger.info(
                    f"Juso 변환: {address} → "
                    f"{juso_result['dong']} {juso_result.get('bun','')}-{juso_result.get('ji','')}"
                )
                sigungu_code, bdong_code = client.get_legal_dong_codes(parsed)

            else:
                # 2차 시도: Nominatim (법정동 이름만 추출)
                nominatim_dong = _resolve_dong_from_nominatim(address)
                if nominatim_dong:
                    parsed["dong"]         = nominatim_dong
                    parsed["is_road_name"] = False
                    was_road_name = parsed.get("road_name", "")
                    logger.info(f"Nominatim 법정동 추출: {nominatim_dong}")
                    sigungu_code, bdong_code = client.get_legal_dong_codes(parsed)

                else:
                    # 3차 시도: 시군구 내 법정동 순회 (최후 수단)
                    logger.info("[road_scan] Kakao/Nominatim 모두 실패 → 법정동 순회")
                    road_name  = parsed.get("road_name", "")
                    bldg_bun   = parsed.get("bun", "")
                    bldg_ji    = parsed.get("ji", "")
                    bldg_token = f"{bldg_bun}-{bldg_ji}" if bldg_ji else bldg_bun

                    tmp_sigungu_code, _ = client.get_legal_dong_codes({
                        "sido": parsed.get("sido", ""),
                        "sigungu": parsed.get("sigungu", ""),
                        "dong": "",
                    })
                    scan_bdong_cd, scan_dong_nm = _find_bdong_by_road_scan(
                        client, tmp_sigungu_code, road_name, bldg_token, service_key
                    )
                    if scan_bdong_cd:
                        sigungu_code  = tmp_sigungu_code
                        bdong_code    = scan_bdong_cd
                        was_road_name = road_name
                    else:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                f"도로명주소({address})에서 법정동을 자동 조회하지 못했습니다. "
                                "지번주소(예: 동구 중대동 422-2)로 입력해 주세요."
                            )
                        )
        else:
            # 지번주소: 기존 로직
            sigungu_code, bdong_code = client.get_legal_dong_codes(parsed)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"주소 파싱 실패: {str(e)}")

    if was_road_name:
        # 도로명주소(Nominatim/road_scan): bun/ji 없이 동 전체 건물 조회
        bun = ""
        ji  = ""
    else:
        bun = parsed.get("bun", "").zfill(4) if parsed.get("bun") else ""
        ji  = parsed.get("ji",  "").zfill(4) if parsed.get("ji")  else "0000"

    # 2. 건축물대장 10종 API 호출 (fetch_building_ledger_by_pnu와 동일 로직)
    encoded_key = urllib.parse.quote(service_key, safe="")
    base_url    = "https://apis.data.go.kr/1613000/BldRgstHubService"

    endpoints = {
        "title":        "getBrTitleInfo",
        "basis":        "getBrBasisOulnInfo",
        "floor":        "getBrFlrOulnInfo",
        "expos_pubuse": "getBrExposPubuseAreaInfo",
        "hs_price":     "getBrHsprcInfo",
        "expos":        "getBrExposInfo",
        "wclf":         "getBrWclfInfo",
        "recap":        "getBrRecapTitleInfo",
        "atch_jibun":   "getBrAtchJibunInfo",
        "jijigu":       "getBrJijiguInfo",
    }

    def _fetch_items(method, sc, bc, b, j, page=1, num=100, plat_gb=0):
        url = (
            f"{base_url}/{method}?"
            f"sigunguCd={sc}&bjdongCd={bc}&platGbCd={plat_gb}"
            f"&bun={b}&ji={j}&numOfRows={num}&pageNo={page}&_type=json&serviceKey={encoded_key}"
        )
        import time
        # 긴 타임아웃(25초)보다 짧은 타임아웃(8초)으로 여러 번 재시도하는 것이 공공 API 병목을 피하는 데 유리합니다.
        for attempt in range(3):
            try:
                resp = std_requests.get(url, timeout=8)
                if resp.status_code == 200:
                    data = resp.json()
                    body = data.get("response", {}).get("body", {})
                    rc   = data.get("response", {}).get("header", {}).get("resultCode", "")
                    if rc == "00":
                        total_count = int(body.get("totalCount", 0))
                        items_raw   = body.get("items", {})
                        items       = items_raw.get("item", []) if items_raw else []
                        if isinstance(items, dict):
                            items = [items]
                        return items, total_count
                break # 정상 응답이지만 resultCode가 00이 아니거나 상태코드가 200이 아닌 경우 반복 종료
            except Exception as e:
                if attempt < 2:
                    logger.warning(f"Ledger API error [{method}] (Attempt {attempt+1}/3) - retrying...: {e}")
                    time.sleep(1)
                else:
                    logger.error(f"Ledger API error [{method}] failed after 3 attempts: {e}")
        return [], 0

    results = {}
    title_list = []

    # ── 도로명주소: title API를 페이지 순회하여 정확한 건물을 찾음 ──────────────
    if was_road_name:
        road_name  = parsed.get("road_name", "")
        bldg_bun   = parsed.get("bun", "")
        bldg_ji    = parsed.get("ji", "")
        bldg_token = f"{bldg_bun}-{bldg_ji}" if bldg_ji else bldg_bun

        def _is_road_match(item):
            road_addr = (item.get("newPlatPlc") or "").strip()
            if not road_addr:
                return False
            if road_name and bldg_token:
                return road_name in road_addr and bldg_token in road_addr
            elif road_name:
                return road_name in road_addr
            return False

        # 전체 title 목록 수집 (페이지 순회)
        all_titles = []
        first_page, total_count = _fetch_items("getBrTitleInfo", sigungu_code, bdong_code, "", "", page=1, num=100)
        all_titles.extend(first_page)
        if total_count > 100:
            import math
            for pg in range(2, math.ceil(total_count / 100) + 1):
                page_items, _ = _fetch_items("getBrTitleInfo", sigungu_code, bdong_code, "", "", page=pg, num=100)
                all_titles.extend(page_items)

        # 도로명+건물번호로 필터링
        filtered = [t for t in all_titles if _is_road_match(t)]
        if filtered:
            results["title"] = filtered
            title_list = filtered
            logger.info(f"도로명 필터링: {len(filtered)}개 매칭 (전체 {len(all_titles)}개 중)")
        else:
            # 필터 매칭 없으면 전체 반환
            results["title"] = all_titles
            title_list = all_titles
            logger.info(f"도로명 필터링 매칭 없음 → 전체 {len(all_titles)}개 반환")

        # 나머지 API는 첫 번째 매칭 건물의 지번으로 조회
        if title_list:
            import re
            first    = title_list[0]
            plat_plc = first.get("platPlc", "")

            # platGbCd 추출 (0=대지, 1=산, 2=블록) — title 항목에서 직접 가져옴
            real_plat_gb = str(first.get("platGbCd", "0") or "0")

            # platPlc에서 bun/ji 추출: "대구광역시 동구 중대동 422-2번지" → bun=0422, ji=0002
            # ※ 끝의 '번지' 접미사를 제거하고 숫자만 추출
            m = re.search(r"(\d+)(?:-(\d+))?(?:번지)?\s*$", plat_plc.strip())
            if m:
                real_bun = m.group(1).zfill(4)
                real_ji  = (m.group(2) or "0").zfill(4)
                logger.info(f"platPlc 파싱: {plat_plc} → bun={real_bun}, ji={real_ji}, platGbCd={real_plat_gb}")
            else:
                real_bun = bun
                real_ji  = ji
                logger.warning(f"platPlc 파싱 실패: '{plat_plc}' → bun/ji 빈값 폴백")
        else:
            real_bun     = bun
            real_ji      = ji
            real_plat_gb = "0"

        for key, method in endpoints.items():
            if key == "title":
                continue  # 이미 수집
            items, _ = _fetch_items(method, sigungu_code, bdong_code, real_bun, real_ji, plat_gb=real_plat_gb)
            results[key] = items

    else:
        # 지번주소: bun/ji로 직접 조회
        for key, method in endpoints.items():
            items, _ = _fetch_items(method, sigungu_code, bdong_code, bun, ji)
            results[key] = items
        title_list = results.get("title", [])

    has_data = any(len(v) > 0 for v in results.values())

    return {
        "success":        has_data,
        "address":        address,
        "parsed_address": parsed,
        "sigungu_code":   sigungu_code,
        "bdong_code":     bdong_code,
        "bun":            bun,
        "ji":             ji,
        "all_raw_data":   results,
        # 편의용 요약
        "summary": {
            "platPlc":       title_list[0].get("platPlc",       "") if title_list else "",
            "newPlatPlc":    title_list[0].get("newPlatPlc",    "") if title_list else "",
            "mainPurpsCdNm": title_list[0].get("mainPurpsCdNm","") if title_list else "",
            "strctCdNm":     title_list[0].get("strctCdNm",    "") if title_list else "",
            "totArea":       title_list[0].get("totArea",       0)  if title_list else 0,
            "useAprDay":     title_list[0].get("useAprDay",     "") if title_list else "",
            "violBldYn":     title_list[0].get("violBldYn",    "N") if title_list else "N",
            "grndFlrCnt":    title_list[0].get("grndFlrCnt",   0)  if title_list else 0,
            "ugrndFlrCnt":   title_list[0].get("ugrndFlrCnt",  0)  if title_list else 0,
        }
    }
