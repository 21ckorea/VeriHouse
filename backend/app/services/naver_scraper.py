import re
import time
import logging
from curl_cffi import requests

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────
# 브라우저 위장 헤더
# ─────────────────────────────────────────────────────────
_FIN_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "referer": "https://fin.land.naver.com/",
    "origin": "https://fin.land.naver.com",
}


class NaverLandScraper:
    """
    curl_cffi 기반 네이버 부동산(fin.land.naver.com) 스크래퍼.

    ■ 수집 전략
      - fin.land.naver.com 개별 API (중개사, 교통, 수수료, 세금, 건축물대장) 수집
      - 기본 정보(주소·가격·면적 등)는 buildingRegistration 응답에서 추출하거나
        수동으로 제공된 PNU 코드를 활용

    ■ 봇 차단 우회
      - impersonate='chrome' 으로 TLS 지문을 실제 Chrome과 동일하게 위장
    """

    def __init__(self):
        self._session = requests.Session()
        self._warmed_up = False
        self._ip_blocked = False  # 클라우드 IP 차단 여부 플래그
        
        # ScraperAPI 연동 설정
        import os
        self._scraper_api_key = os.getenv("SCRAPER_API_KEY", "").strip()

        # 프록시 설정
        self._proxies = None
        if self._scraper_api_key:
            # ScraperAPI를 프록시 모드로 사용 (curl_cffi의 TLS 위장을 Naver 서버까지 그대로 전달하기 위해)
            proxy_url = f"http://scraperapi.premium=true:{self._scraper_api_key}@proxy-server.scraperapi.com:8001"
            self._proxies = {"http": proxy_url, "https": proxy_url}

    def _build_scraper_url(self, target_url: str) -> str:
        """이전 방식(URL 리라이팅)은 더 이상 사용하지 않지만 호환성을 위해 원본 URL을 그대로 반환합니다."""
        return target_url

    # ── 세션 워밍업 ──────────────────────────────────────────
    def _warmup(self):
        """메인 페이지를 미리 방문하여 세션 쿠키를 획득합니다."""
        if self._warmed_up or self._ip_blocked:
            return
        try:
            res = self._session.get(
                "https://fin.land.naver.com/",
                headers=_FIN_HEADERS,
                impersonate="chrome",
                proxies=self._proxies,
                verify=False,
                timeout=60,
            )
            time.sleep(0.8)
            self._warmed_up = True
            logger.info("Naver Land session warmed up (ScraperAPI Proxy: %s)", bool(self._scraper_api_key))
        except Exception as e:
            logger.warning(f"Session warmup failed (non-fatal): {e}")
            if not self._scraper_api_key and ("Connection reset" in str(e) or "timed out" in str(e) or "Timeout" in str(e)):
                logger.error("Cloud IP seems to be blocked by Naver WAF. Enabling fast-fail.")
                self._ip_blocked = True

    # ── URL / ID 파싱 ────────────────────────────────────────
    def extract_article_no(self, url_or_id: str) -> str:
        """
        네이버 부동산 URL 또는 문자열에서 매물번호(10자리)를 추출합니다.
        """
        cleaned = url_or_id.strip()

        if cleaned.isdigit() and len(cleaned) == 10:
            return cleaned

        for pattern in [r"articleNo=(\d+)", r"/articles/(\d+)", r"\b(\d{10})\b"]:
            m = re.search(pattern, cleaned)
            if m:
                return m.group(1)

        raise ValueError(
            "네이버 부동산 매물 번호(10자리 숫자)를 찾을 수 없습니다. "
            "올바른 URL 또는 ID를 입력해주세요."
        )

    # ── 내부 GET 헬퍼 ────────────────────────────────────────
    def _get_json(self, url: str, delay: float = 1.0) -> dict | None:
        """curl_cffi로 JSON API를 호출하고 결과를 반환합니다. 429 및 타임아웃 시 재시도합니다."""
        if self._ip_blocked:
            return None

        max_retries = 3

        for attempt in range(max_retries):
            try:
                res = self._session.get(
                    url,
                    headers=_FIN_HEADERS,
                    impersonate="chrome",
                    proxies=self._proxies,
                    verify=False,
                    timeout=60, # 프록시 경유 시 응답이 지연될 수 있으므로 타임아웃을 넉넉히 줌
                )
                time.sleep(delay)
                if res.status_code == 200:
                    return res.json()
                elif res.status_code == 429:
                    wait_time = 3 * (attempt + 1)
                    logger.warning(f"HTTP 429 for {url}. Waiting {wait_time}s and retrying...")
                    time.sleep(wait_time)
                    continue
                logger.warning(f"HTTP {res.status_code} for {url}")
                return None
            except Exception as e:
                if not self._scraper_api_key and ("Connection reset" in str(e) or "timed out" in str(e)):
                    logger.error(f"IP blocked detected during _get_json: {e}")
                    self._ip_blocked = True
                    return None

                if attempt < max_retries - 1:
                    wait_time = 3 * (attempt + 1)
                    logger.warning(f"Request error for {url} (Attempt {attempt+1}/{max_retries}): {e}. Waiting {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"Request error for {url} after {max_retries} attempts: {e}")
                    return None
        return None

    # ── 매물 상세 정보 수집 (메인) ───────────────────────────
    def get_article_details(self, article_no_or_url: str, pnu_code: str = "") -> dict:
        """
        매물번호(또는 URL)로 네이버 부동산 매물 정보를 수집합니다.

        Args:
            article_no_or_url: 10자리 매물번호 또는 네이버 부동산 URL
            pnu_code: PNU 코드 (있으면 건축물대장 정보 수집 가능). 없어도 무방.

        수집 데이터:
          - 건축물 정보  : 주소, 구조, 사용승인일, 용도, 용적률, 건폐율 (buildingRegistration)
          - 중개사 정보  : 상호, 대표, 연락처, 등록번호 (agent)
          - 대중교통     : 버스, 지하철 요약 (transport)
          - 중개보수     : 금액, 요율 (agentFee)
          - 취득세       : 취득세, 지방교육세 (tax)
        """
        try:
            article_no = self.extract_article_no(article_no_or_url)
        except ValueError as e:
            return {"success": False, "message": str(e)}

        self._warmup()
        logger.info(f"Fetching Naver Land article {article_no}")

        result: dict = {
            "success": True,
            "article_no": article_no,
            "pnu_code": pnu_code,
            "simulation_mode": False,
            # 기본값 (업데이트될 예정)
            "title": "",
            "property_type": "",
            "property_type_code": "",
            "trade_type": "",
            "address": "",
            "road_address": "",
            "description": "",
            "latitude": 0.0,
            "longitude": 0.0,
            "price_info": {"dealPrice": 0, "warrantyPrice": 0, "rentPrice": 0},
            "area_exclusive": 0.0,
            "area_supply": 0.0,
            "area_land": 0.0,
            "area_total": 0.0,
            "floor_info": "",
            "room_count": 0,
            "bathroom_count": 0,
            "direction": "",
            "violating_building_tag": False,
        }

        any_success = False  # 한 API라도 성공했는지 추적

        # ── [1] 동적 메타 해석: PNU / realEstateType / tradeType ────
        pnu = pnu_code
        real_estate_type = "C03"  # 기본값
        trade_type_code  = "A1"   # 기본값 (매매)

        if not pnu and not self._ip_blocked:
            try:
                logger.info(f"PNU code not provided. Dynamically resolving for article {article_no}")
                article_url = f"https://fin.land.naver.com/articles/{article_no}"
                
                html = ""
                for attempt in range(3):
                    try:
                        res_redirect = self._session.get(
                            article_url,
                            headers=_FIN_HEADERS,
                            impersonate="chrome",
                            allow_redirects=False,
                            proxies=self._proxies,
                            verify=False,
                            timeout=60,
                        )
                        time.sleep(1.0)
                        
                        if res_redirect.status_code == 429:
                            wait_time = 3 * (attempt + 1)
                            logger.warning(f"HTTP 429 on dynamic resolve. Waiting {wait_time}s...")
                            time.sleep(wait_time)
                            continue

                        # 프록시 모드에서는 자동으로 location을 따라가지 않으므로 헤더에서 가져옴
                        redirect_url = res_redirect.headers.get("location")
                        if not redirect_url and res_redirect.status_code == 200:
                            # 만약 이미 리다이렉트되어 200이 떨어졌다면
                            html = res_redirect.text
                            break

                        if redirect_url:
                            if redirect_url.startswith("/"):
                                redirect_url = "https://fin.land.naver.com" + redirect_url
                            
                            res_map = self._session.get(
                                redirect_url,
                                headers=_FIN_HEADERS,
                                impersonate="chrome",
                                proxies=self._proxies,
                                verify=False,
                                timeout=60,
                            )
                            time.sleep(1.0)
                            if res_map.status_code == 200:
                                html = res_map.text
                                break
                            elif res_map.status_code == 429:
                                wait_time = 3 * (attempt + 1)
                                logger.warning(f"HTTP 429 on map resolve. Waiting {wait_time}s...")
                                time.sleep(wait_time)
                                continue
                        break
                    except Exception as e:
                        if not self._scraper_api_key and ("Connection reset" in str(e) or "timed out" in str(e)):
                            logger.error(f"IP blocked detected during dynamic resolve: {e}")
                            self._ip_blocked = True
                            break

                        if attempt < 2:
                            wait_time = 3 * (attempt + 1)
                            logger.warning(f"Dynamic resolve error (Attempt {attempt+1}/3): {e}. Waiting {wait_time}s...")
                            time.sleep(wait_time)
                        else:
                            logger.error(f"Failed to dynamically resolve meta after 3 attempts: {e}")
                            break

                if html:
                    # PNU
                    m_pnu = re.search(r'\\\"pnu\\\":\\\"(\d{19})\\\"', html)
                    if m_pnu:
                        pnu = m_pnu.group(1)
                        result["pnu_code"] = pnu
                        logger.info(f"Dynamically resolved PNU: {pnu}")

                    # basicInfo queryKey 에서 realEstateType / tradeType 추출
                    m_ret = re.search(
                        r'GET /article/basicInfo.*?realEstateType\\\\+":\\\\+"([A-Z][0-9]+)', html
                    )
                    m_trade = re.search(
                        r'GET /article/basicInfo.*?tradeType\\\\+":\\\\+"([A-Z][0-9]+)', html
                    )
                    if m_ret:
                        real_estate_type = m_ret.group(1)
                        result["property_type_code"] = real_estate_type
                        logger.info(f"Dynamically resolved realEstateType: {real_estate_type}")
                    if m_trade:
                        trade_type_code = m_trade.group(1)
                        logger.info(f"Dynamically resolved tradeType: {trade_type_code}")
            except Exception as e:
                logger.error(f"Unexpected error in dynamic resolve for {article_no}: {e}")

        # ── [2] basicInfo API — 가격 / 면적 / 층수 / 방 / 향 ────────
        basic_url = (
            f"https://fin.land.naver.com/front-api/v1/article/basicInfo"
            f"?articleNumber={article_no}"
            f"&realEstateType={real_estate_type}"
            f"&tradeType={trade_type_code}"
        )
        basic = self._get_json(basic_url)
        if basic and basic.get("result"):
            any_success = True
            br = basic["result"]
            price_info  = br.get("priceInfo", {})
            detail      = br.get("detailInfo", {})
            space_info  = detail.get("spaceInfo", {})
            size_info   = detail.get("sizeInfo", {})
            facility    = detail.get("facilityInfo", {})
            article_det = detail.get("articleDetailInfo", {})
            floor_info  = space_info.get("floorInfo", {})
            moving_in   = detail.get("movingInInfo", {})

            # 가격 (만원 단위)
            price_raw = price_info.get("price", 0) or 0
            prev_dep  = price_info.get("previousDeposit", 0) or 0
            prev_rent = price_info.get("previousMonthlyRent", 0) or 0

            # tradeType 코드 → 한국어
            _trade_map = {
                "A1": "매매", "B1": "전세", "B2": "월세", "B3": "단기임대",
                "B4": "년세", "B5": "분기세",
            }
            trade_kr = _trade_map.get(trade_type_code, trade_type_code)
            result["trade_type"] = trade_kr

            if trade_type_code == "A1":
                result["price_info"] = {"dealPrice": price_raw // 10000, "warrantyPrice": 0, "rentPrice": 0}
            elif trade_type_code == "B1":
                result["price_info"] = {"dealPrice": 0, "warrantyPrice": price_raw // 10000, "rentPrice": 0}
            else:
                result["price_info"] = {
                    "dealPrice": 0,
                    "warrantyPrice": prev_dep // 10000,
                    "rentPrice":     price_raw // 10000,
                }

            # 면적 정보
            result["area_land"]      = float(size_info.get("landSpace", 0.0) or 0.0)
            result["area_total"]     = float(size_info.get("floorSpace", 0.0) or 0.0)
            result["area_supply"]    = float(size_info.get("supplySpace", 0.0) or 0.0)
            result["area_exclusive"] = float(size_info.get("exclusiveSpace", 0.0) or 0.0)

            # 층수 (예: "2/B1층" 또는 "5/15층")
            tgt   = floor_info.get("targetFloor", "")
            gnd   = floor_info.get("groundTotalFloor", "")
            ugnd  = floor_info.get("undergroundTotalFloor", "")
            
            if not tgt or tgt == "-":
                # 단독주택 등 대상 층이 없는 경우 (지상/지하층 표기)
                if ugnd and ugnd != "0":
                    ugnd_str = f"B{ugnd}" if str(ugnd).isdigit() and int(ugnd) > 0 else ugnd
                    result["floor_info"] = f"{gnd}/{ugnd_str}층"
                else:
                    result["floor_info"] = f"{gnd}층" if gnd else "-"
            else:
                # 일반적인 경우 (해당층/전체지상층 표기)
                if gnd:
                    result["floor_info"] = f"{tgt}/{gnd}층"
                else:
                    result["floor_info"] = f"{tgt}층"

            # 방/욕실수
            result["room_count"]     = space_info.get("roomCount", 0)
            result["bathroom_count"] = space_info.get("bathRoomCount", 0)

            # 향
            _dir_map = {
                "EE": "동향", "WW": "서향", "SS": "남향", "NN": "북향",
                "ES": "남동향", "WS": "남서향", "EN": "북동향", "WN": "북서향",
            }
            result["direction"] = _dir_map.get(space_info.get("direction", ""), space_info.get("direction", ""))

            # 매물 설명 / 제목
            result["title"]       = article_det.get("articleName", "")
            result["description"] = article_det.get("articleFeatureDescription", "")

            # 좌표 (buildingRegistration 보다 우선 적용 가능)
            coords = article_det.get("coordinates", {})
            if coords.get("xCoordinate"):
                result["latitude"]  = coords.get("yCoordinate", 0.0)
                result["longitude"] = coords.get("xCoordinate", 0.0)

            # 건물 용도 (기본값)
            if not result.get("property_type"):
                result["property_type"] = article_det.get("buildingUse", "")

            # 사용승인일 / 세대수 등 (facility)
            if not result.get("building_info"):
                result["building_info"] = {
                    "legal_address":           result.get("address", ""),
                    "road_address":            result.get("road_address", ""),
                    "building_use":            article_det.get("buildingUse", ""),
                    "structure":               "",
                    "use_approval_date":       facility.get("buildingConjunctionDate", ""),
                    "elapsed_years":           facility.get("approvalElapsedYear"),
                    "household_number":        facility.get("householdNumber"),
                    "family_number":           0,
                    "elevator_count":          0,
                    "parking_count":           facility.get("totalParkingCount", facility.get("parkingCount")),
                    "floor_area_ratio":        size_info.get("floorAreaRatio"),
                    "building_coverage_ratio": size_info.get("buildingCoverageRatio"),
                    "land_purpose":            None,
                    "land_district":           None,
                }
            else:
                # building_info 가 이미 있으면 면적/층수 등 보완
                bi = result["building_info"]
                if not bi.get("use_approval_date"):
                    bi["use_approval_date"] = facility.get("buildingConjunctionDate", "")
                if not bi.get("elapsed_years"):
                    bi["elapsed_years"] = facility.get("approvalElapsedYear")
                if not bi.get("floor_area_ratio"):
                    bi["floor_area_ratio"] = size_info.get("floorAreaRatio")
                if not bi.get("building_coverage_ratio"):
                    bi["building_coverage_ratio"] = size_info.get("buildingCoverageRatio")

        # ── [3] 건축물대장 정보 (buildingRegistration — 주소/구조 상세) ─
        if pnu:
            bldg_url = (
                f"https://fin.land.naver.com/front-api/v1/complex/buildingRegistration"
                f"?pnu={pnu}&realEstateType={real_estate_type}"
            )
            bldg = self._get_json(bldg_url)
            if bldg and bldg.get("result"):
                b = bldg["result"]
                ratio   = b.get("buildingRatioInfo", {})
                purpose = b.get("specialPurposeInfo", {}).get("area", {})
                coords  = b.get("coordinates", {})
                any_success = True

                result["address"]      = b.get("legalDivisionAddress", "") or result["address"]
                result["road_address"] = b.get("roadNameAddress", "")      or result["road_address"]
                if coords.get("xCoordinate"):
                    result["latitude"]  = coords.get("yCoordinate", 0.0)
                    result["longitude"] = coords.get("xCoordinate", 0.0)

                # Initialize building_info if not present
                if not result.get("building_info"):
                    result["building_info"] = {}
                
                bi = result["building_info"]
                
                # Helper to set value if not already set or if new value is present
                def merge_val(k, v):
                    if v is not None and v != "":
                        bi[k] = v

                merge_val("legal_address", b.get("legalDivisionAddress"))
                merge_val("road_address", b.get("roadNameAddress"))
                merge_val("building_use", b.get("buildingUse"))
                merge_val("structure", b.get("structure"))
                merge_val("use_approval_date", b.get("useApprovalDate"))
                merge_val("elapsed_years", b.get("approvalElapsedYear"))
                merge_val("household_number", b.get("householdNumber"))
                merge_val("family_number", b.get("familyNumber"))
                merge_val("elevator_count", b.get("elevatorCount"))
                merge_val("floor_area_ratio", ratio.get("floorAreaRatio"))
                merge_val("building_coverage_ratio", ratio.get("buildingCoverageRatio"))
                merge_val("land_purpose", purpose.get("purpose"))
                merge_val("land_district", purpose.get("district"))
                merge_val("parking_count", b.get("parkingCount") or b.get("totalParkingCount"))

                result["property_type"] = b.get("buildingUse", "") or result["property_type"]

        # ── [2] 취득세 정보 (realEstateType 포함) ────────────
        tax_url = f"https://fin.land.naver.com/front-api/v1/article/tax?articleNumber={article_no}"
        tax = self._get_json(tax_url)
        if tax and tax.get("result"):
            any_success = True
            article_info = tax["result"].get("articleInfo", {})
            acq = tax["result"].get("acquisitionTax", {})

            # realEstateType 추출
            result["property_type_code"] = article_info.get("realEstateType", "")

            result["tax_info"] = {
                "acquisition_tax": acq.get("acquisitionTax", 0),
                "local_tax":       acq.get("localTax", 0),
                "rural_special_tax": acq.get("ruralSpecialTax", 0),
                "total": (
                    acq.get("acquisitionTax", 0)
                    + acq.get("localTax", 0)
                    + acq.get("ruralSpecialTax", 0)
                ),
            }

        # ── [3] 중개사 정보 ──────────────────────────────────
        agent_url = f"https://fin.land.naver.com/front-api/v1/article/agent?articleNumber={article_no}"
        agent = self._get_json(agent_url)
        if agent and agent.get("result"):
            any_success = True
            a = agent["result"]
            phone = a.get("phone", {})
            result["agent"] = {
                "brokerage_name":      a.get("brokerageName"),
                "broker_name":         a.get("brokerName"),
                "address":             a.get("address"),
                "phone_mobile":        phone.get("mobile"),
                "phone_brokerage":     phone.get("brokerage"),
                "registration_number": a.get("businessRegistrationNumber"),
                "profile_image":       a.get("profileImageUrl"),
            }

        # ── [4] 대중교통 정보 ────────────────────────────────
        transport_url = (
            f"https://fin.land.naver.com/front-api/v1/article/transport"
            f"?itemType=article&itemId={article_no}"
        )
        transport = self._get_json(transport_url)
        if transport and transport.get("result"):
            any_success = True
            tr = transport["result"]
            bus_list   = tr.get("busList", [])
            metro_list = tr.get("subwayList", [])

            bus_summary = []
            for bus in bus_list:
                routes = ", ".join(bus.get("list", []))
                bus_summary.append(f"{bus.get('typeName')}({routes})")

            metro_summary = []
            for metro in metro_list:
                metro_summary.append(
                    f"{metro.get('lineName')} {metro.get('stationName')} "
                    f"({metro.get('walkingTime', '?')}분)"
                )

            result["transport"] = {
                "bus":   " | ".join(bus_summary),
                "metro": " | ".join(metro_summary),
            }

        # ── [5] 중개보수 정보 ────────────────────────────────
        fee_url = f"https://fin.land.naver.com/front-api/v1/article/agentFee?articleNumber={article_no}"
        fee = self._get_json(fee_url)
        if fee and fee.get("result"):
            any_success = True
            f_data = fee["result"]
            result["agent_fee"] = {
                "fee":           f_data.get("fee", 0),
                "fee_ratio_min": f_data.get("feeRatio", {}).get("min"),
                "fee_ratio_max": f_data.get("feeRatio", {}).get("max"),
            }

        if not any_success:
            logger.warning(f"All fin.land APIs failed for {article_no}. Returning simulation.")
            return self._generate_simulated_article(article_no)

        return result

    # ── 시뮬레이션 데이터 (최후 폴백) ───────────────────────
    def _generate_simulated_article(self, article_no: str) -> dict:
        logger.warning(f"Generating simulated data for article {article_no}")
        last_digit = int(article_no[-1]) if article_no and article_no[-1].isdigit() else 0

        if last_digit % 2 == 1:
            title, prop, trade = "신축급 투룸 빌라 전세 풀옵션", "빌라", "전세"
            price = {"dealPrice": 0, "warrantyPrice": 23000, "rentPrice": 0}
            floor, area_ex, address = "2/4", 42.15, "서울특별시 마포구 아현동 123-45"
        elif last_digit % 3 == 0:
            title, prop, trade = "넓은 원룸 월세 즉시입주", "원룸", "월세"
            price = {"dealPrice": 0, "warrantyPrice": 1000, "rentPrice": 55}
            floor, area_ex, address = "1/3", 28.50, "경기도 성남시 분당구 삼평동 629"
        else:
            title, prop, trade = "역세권 아파트 급매물", "아파트", "매매"
            price = {"dealPrice": 78000, "warrantyPrice": 0, "rentPrice": 0}
            floor, area_ex, address = "3/5", 45.28, "서울특별시 마포구 아현동 124-45"

        return {
            "success": True,
            "article_no": article_no,
            "title": f"[시뮬레이션] {title}",
            "property_type": prop,
            "property_type_code": "VL" if prop == "빌라" else "APT",
            "trade_type": trade,
            "price_info": price,
            "floor_info": floor,
            "area_exclusive": area_ex,
            "area_supply": round(area_ex * 1.15, 2),
            "area_land": 0.0,
            "area_total": 0.0,
            "room_count": 2,
            "bathroom_count": 1,
            "address": address,
            "road_address": "",
            "description": f"[시뮬레이션 데이터] 매물번호 {article_no}",
            "latitude": 37.5562,
            "longitude": 126.9536,
            "direction": "",
            "violating_building_tag": False,
            "simulation_mode": True,
        }


# ── 자가 진단 ────────────────────────────────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    scraper = NaverLandScraper()

    # ID 추출 테스트
    print("== extract_article_no 테스트 ==")
    print(scraper.extract_article_no("https://fin.land.naver.com/articles/2629880449"))
    print(scraper.extract_article_no("articleNo=2629852987"))
    print(scraper.extract_article_no("2629880449"))

    # 매물 조회 테스트 (첨부 코드의 매물: pnu_code 포함)
    print("\n== get_article_details 테스트 (2629880449) ==")
    result = scraper.get_article_details("2629880449", pnu_code="2714014100101930003")
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
