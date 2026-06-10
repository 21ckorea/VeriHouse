import re
import os
import pandas as pd
import logging
from typing import Tuple, Optional, Dict, Any
from PublicDataReader import BuildingLedger
import PublicDataReader as pdr
from dotenv import load_dotenv

# .env 파일을 이 파일 기준으로 3단계 위(backend/) 에서 명시적으로 로드
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
load_dotenv(_env_path)

logger = logging.getLogger(__name__)

class PublicDataClient:
    def __init__(self, service_key: Optional[str] = None):
        # Decoding key format for PublicDataReader
        self.service_key = service_key or os.getenv("PUBLIC_DATA_SERVICE_KEY")
        self.api = None
        if self.service_key:
            try:
                self.api = BuildingLedger(self.service_key)
            except Exception as e:
                logger.error(f"Failed to initialize BuildingLedger with service key: {e}")
        
        # Cache for bdong codes to avoid loading it on every single query
        self._bdong_df = None

    @property
    def bdong_df(self) -> pd.DataFrame:
        if self._bdong_df is None:
            logger.info("Loading legal dong codes from PublicDataReader...")
            try:
                # Load bdong codes and filter only active ones (말소일자 is empty)
                df = pdr.code_bdong()
                self._bdong_df = df[df["말소일자"] == ""]
            except Exception as e:
                logger.error(f"Failed to load bdong codes: {e}")
                # Fallback to an empty DataFrame if loading fails
                self._bdong_df = pd.DataFrame()
        return self._bdong_df

    @staticmethod
    def _is_road_name_address(address_str: str) -> bool:
        """
        도로명주소인지 감지합니다.
        '길', '로', '대로'로 끝나는 토큰이 있으면 도로명주소로 판단합니다.
        """
        tokens = address_str.split()
        road_suffixes = ('길', '로', '대로')
        for t in tokens:
            # 숫자가 없고 도로명 접미사로 끝나는 토큰
            if any(t.endswith(s) for s in road_suffixes) and not re.match(r'^\d', t):
                return True
        return False

    def parse_korean_address(self, address_str: str) -> Dict[str, Any]:
        """
        Parses a Korean address string to extract Sido, Sigungu, Dong, Bun, and Ji.
        지번주소: "서울특별시 마포구 아현동 123-45"
        도로명주소: "대구광역시 동구 용진길 14-18" (is_road_name=True로 표시, dong은 빈값)
        """
        result = {
            "sido": "",
            "sigungu": "",
            "dong": "",
            "bun": "",
            "ji": "",
            "is_road_name": False,
            "road_name": "",
            "raw_address": address_str
        }
        
        # Clean address
        cleaned_addr = re.sub(r'\s+', ' ', address_str.strip())
        tokens = cleaned_addr.split(' ')
        
        # ── 도로명주소 감지 ───────────────────────────────────────────
        if self._is_road_name_address(cleaned_addr):
            result["is_road_name"] = True
            
            # sido 정규화
            sido_raw = tokens[0] if tokens else ""
            sido = self._normalize_sido(sido_raw)
            result["sido"] = sido

            # sigungu + road_name + building_number 파싱
            sigungu_parts = []
            road_name = ""
            building_token = ""

            for token in tokens[1:]:
                if re.match(r'^\d+(-\d+)?$', token):
                    # 건물번호 (예: 14-18, 100)
                    building_token = token
                    break
                elif any(token.endswith(s) for s in ('길', '로', '대로')):
                    road_name = token
                elif token.endswith(('구', '군', '시')) and not token.endswith(('동', '읍', '면', '리')):
                    sigungu_parts.append(token)

            result["sigungu"] = " ".join(sigungu_parts)
            result["road_name"] = road_name

            # 건물번호 → bun/ji
            if building_token:
                if '-' in building_token:
                    bun, ji = building_token.split('-', 1)
                else:
                    bun, ji = building_token, ""
                result["bun"] = bun
                result["ji"] = ji

            return result

        # ── 지번주소 파싱 (기존 로직) ────────────────────────────────
        jibun_token = ""
        address_parts = []
        
        for token in tokens:
            if re.match(r'^\d+(\-\d+)?$', token):
                jibun_token = token
                break
            else:
                address_parts.append(token)
                
        # If we didn't find Jibun token by exact match, look for any token containing digits
        if not jibun_token:
            for token in tokens:
                match = re.search(r'(\d+(-\d+)?)', token)
                if match:
                    jibun_token = match.group(1)
                    break
        
        sido = address_parts[0] if len(address_parts) > 0 else ""
        sido = self._normalize_sido(sido)
        result["sido"] = sido
        
        sigungu_parts = []
        dong = ""
        
        for part in address_parts[1:]:
            if part.endswith(("구", "군", "시")) and not part.endswith(("동", "읍", "면", "리")):
                sigungu_parts.append(part)
            elif part.endswith(("동", "읍", "면", "리")):
                dong = part
                break
                
        result["sigungu"] = " ".join(sigungu_parts)
        result["dong"] = dong
        
        if jibun_token:
            if '-' in jibun_token:
                bun, ji = jibun_token.split('-')
            else:
                bun, ji = jibun_token, ""
            result["bun"] = bun
            result["ji"] = ji
            
        return result

    @staticmethod
    def _normalize_sido(sido: str) -> str:
        """시도 약칭을 정식 명칭으로 변환합니다."""
        mapping = {
            "서울": "서울특별시", "서울시": "서울특별시",
            "경기": "경기도", "경기도": "경기도",
            "인천": "인천광역시", "인천시": "인천광역시",
            "부산": "부산광역시", "부산시": "부산광역시",
            "대구": "대구광역시", "대구시": "대구광역시",
            "대전": "대전광역시", "대전시": "대전광역시",
            "광주": "광주광역시", "광주시": "광주광역시",
            "울산": "울산광역시", "울산시": "울산광역시",
            "세종": "세종특별자치시", "세종시": "세종특별자치시",
            "강원": "강원특별자치도", "강원도": "강원특별자치도",
            "충북": "충청북도", "충북도": "충청북도",
            "충남": "충청남도", "충남도": "충청남도",
            "전북": "전북특별자치도", "전북도": "전북특별자치도",
            "전남": "전라남도", "전남도": "전라남도",
            "경북": "경상북도", "경북도": "경상북도",
            "경남": "경상남도", "경남도": "경상남도",
            "제주": "제주특별자치도", "제주시": "제주특별자치도", "제주도": "제주특별자치도",
        }
        return mapping.get(sido, sido)

    def get_legal_dong_codes(self, parsed_addr: Dict[str, Any]) -> Tuple[str, str]:
        """
        Looks up the 5-digit sigungu_code and 5-digit bdong_code from parsed address.
        도로명주소의 경우 dong이 없어도 sigungu_code만 반환(bdong_code='00000')합니다.
        Returns: (sigungu_code, bdong_code)
        """
        df = self.bdong_df
        if df.empty:
            raise ValueError("법정동 코드 데이터베이스를 로드할 수 없습니다.")
            
        sido = parsed_addr["sido"]
        sigungu = parsed_addr["sigungu"]
        dong = parsed_addr["dong"]
        is_road_name = parsed_addr.get("is_road_name", False)
        
        # Filter by Sido first
        filtered = df[df["시도명"] == sido]
        
        # Filter by Sigungu
        if sigungu:
            parts = sigungu.split(' ')
            for part in parts:
                filtered = filtered[filtered["시군구명"].str.contains(part, na=False)]
                
        # 도로명주소: dong이 없으므로 시군구 코드만 추출 (bdong_code는 '00000' 또는 첫번째 법정동)
        if is_road_name and not dong:
            if filtered.empty:
                raise ValueError(f"해당 시군구를 찾을 수 없습니다: {sido} {sigungu}")
            # 시군구 코드만 사용 (bdong_code는 공백/00000 으로)
            code = str(filtered.iloc[0]["법정동코드"])
            sigungu_code = code[:5]
            # 도로명주소는 bdong_code 없이 조회 (빈 문자열)
            return sigungu_code, ""

        # 지번주소: dong으로 필터
        if dong:
            filtered = filtered[filtered["읍면동명"] == dong]
            
        if filtered.empty:
            raise ValueError(f"해당 주소의 법정동 코드를 찾을 수 없습니다: {sido} {sigungu} {dong}")
            
        # Get the first match
        code = str(filtered.iloc[0]["법정동코드"]) # 10 digits
        sigungu_code = code[:5]
        bdong_code = code[5:]
        
        return sigungu_code, bdong_code

    def get_building_ledger_data(self, address_str: str) -> Dict[str, Any]:
        """
        Fetches official building register data (표제부, 전유부) using the address.
        If no API Key is provided, it falls back to Demo Mode with mock data.
        """
        parsed_addr = self.parse_korean_address(address_str)
        
        # If API key is not configured, automatically run in Demo/Mock Mode
        if not self.service_key or not self.api:
            logger.warning("No valid Public Data Portal service key configured.")
            return {
                "error": "공공데이터포털 서비스 키(service_key)가 설정되지 않았습니다.",
                "demo_mode": False
            }
            
        try:
            sigungu_code, bdong_code = self.get_legal_dong_codes(parsed_addr)
            bun = parsed_addr["bun"]
            ji = parsed_addr["ji"]
            
            # Format Bun and Ji as 4-digit strings for public data API
            bun_formatted = bun.zfill(4) if bun else ""
            ji_formatted = ji.zfill(4) if ji else "0000"
            
            logger.info(f"Querying Building Ledger: sigungu_code={sigungu_code}, bdong_code={bdong_code}, bun={bun_formatted}, ji={ji_formatted}")
            
            # 1. Fetch Title (표제부) to get general building info, height, parking, and violation status
            title_df = self.api.get_data(
                ledger_type="표제부",
                sigungu_code=sigungu_code,
                bdong_code=bdong_code,
                bun=bun_formatted,
                ji=ji_formatted
            )
            
            # 2. Fetch Exclusive (전유부) to get individual unit details (areas, usages)
            expos_df = self.api.get_data(
                ledger_type="전유부",
                sigungu_code=sigungu_code,
                bdong_code=bdong_code,
                bun=bun_formatted,
                ji=ji_formatted
            )
            
            # Convert DataFrames to JSON/dict
            title_list = title_df.to_dict(orient="records") if not title_df.empty else []
            expos_list = expos_df.to_dict(orient="records") if not expos_df.empty else []
            
            return {
                "demo_mode": False,
                "parsed_address": parsed_addr,
                "sigungu_code": sigungu_code,
                "bdong_code": bdong_code,
                "title_info": title_list,
                "exclusive_info": expos_list
            }
            
        except Exception as e:
            logger.error(f"Error fetching real building register data: {e}")
            return {
                "error": f"건축물대장 API 호출 실패: {str(e)}",
                "demo_mode": False
            }

    def _generate_demo_data(self, parsed_addr: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates rich, realistic mock data for Demonstration Mode.
        Creates different properties based on address keyword or matches them logically.
        """
        address_str = parsed_addr["raw_address"]
        bun = parsed_addr["bun"] or "123"
        ji = parsed_addr["ji"] or "45"
        
        # Custom mock for Daegu Jungdae-dong listing!
        if "중대동" in address_str:
            title_mock = {
                "bldNm": "단독 전원주택",
                "platPlc": "대구광역시 동구 중대동",
                "violBldYn": "N",
                "grndFlrCnt": 2,
                "ugrndFlrCnt": 0,
                "totPkngCnt": 2,
                "useAprvDay": "20030903",
                "mainPurpsCdNm": "단독주택",
                "platArea": 1055.0, # 대지면적: 1055 (공공데이터 공식값)
                "totArea": 197.73,  # 연면적: 197.73
                "vlRat": 32.67,
                "bcRat": 19.71,
                "strctCdNm": "목구조/철근콘크리트",
                "etcStrct": "목구조/철근콘크리트",
            }
            exclusive_mock_list = [{
                "flrNm": "지상1층",
                "hoNm": "",
                "mainPurpsCdNm": "단독주택",
                "exposSpc": 197.73,
                "strctCdNm": "목구조/철근콘크리트"
            }]
            mock_raw_data = {
                "title": [title_mock],
                "basis": [{
                    "platPlc": title_mock["platPlc"],
                    "regstrKindCdNm": "일반건축물",
                    "jiyukCdNm": "자연녹지지역",
                    "jiguCdNm": "최고고도지구",
                    "crtnDay": "20240101"
                }],
                "floor": [
                    {"flrNoNm": "지상1층", "flrArea": 107.01, "purpsCdNm": "단독주택"},
                    {"flrNoNm": "지상2층", "flrArea": 90.72, "purpsCdNm": "단독주택"}
                ],
                "expos_pubuse": [],
                "hs_price": [{"hsprc": 350000000, "crtnDay": "20240101"}],
                "expos": [],
                "wclf": [{"wclfModeCdNm": "부패탱크방법", "capaPsper": 10, "capaLube": 1.5}],
                "recap": [],
                "atch_jibun": [],
                "jijigu": []
            }
            return {
                "demo_mode": True,
                "parsed_address": parsed_addr,
                "sigungu_code": "27140", # Daegu Dong-gu
                "bdong_code": "13500",   # Jungdae-dong
                "title_info": [title_mock],
                "exclusive_info": exclusive_mock_list,
                "all_raw_data": mock_raw_data
            }
        
        # Default mock title부
        title_mock = {
            "bldNm": "그린빌라",                          # 건물명
            "platPlc": address_str.split(bun)[0].strip(), # 대지위치
            "violBldYn": "N",                            # 위반건축물 여부 (Y/N)
            "grndFlrCnt": 4,                             # 지상층수
            "ugrndFlrCnt": 1,                            # 지하층수
            "totPkngCnt": 4,                             # 총 주차대수
            "useAprvDay": "20180512",                    # 사용승인일
            "mainPurpsCdNm": "공동주택",                   # 주용도
            "platArea": 250.0,                           # 대지면적 (㎡) - [NEW]
            "vlRat": 220.5,
            "bcRat": 58.2,
            "strctCdNm": "철근콘크리트구조",
            "etcStrct": "철근콘크리트구조",
        }
        
        # Default mock 전유부
        exclusive_mock_list = []
        
        # Generate all rooms from 101 to 402
        for floor in range(1, 5):
            for room in [1, 2]:
                room_no = f"{floor}0{room}"
                # Let's mock a common mismatch if address has specific triggers to make it interesting!
                main_purps = "공동주택(다세대주택)"
                area = 45.28
                
                # Make 2nd floor 201/202 "Second-class neighborhood living facility" (근린생활시설 - 근생빌라)
                if floor == 2:
                    main_purps = "제2종근린생활시설(사무소)"
                    area = 42.15
                    
                exclusive_mock_list.append({
                    "flrNm": f"{floor}층",
                    "hoNm": f"{room_no}호",
                    "mainPurpsCdNm": main_purps,
                    "exposSpc": area,                        # 전용면적 (㎡)
                    "strctCdNm": "철근콘크리트구조"
                })
                
        # If the address matches certain keywords, we toggle the violation status
        if "위반" in address_str or "viol" in address_str or (bun.isdigit() and int(bun) % 2 == 1):
            title_mock["violBldYn"] = "Y"
            
        mock_raw_data = {
            "title": [title_mock],
            "basis": [{
                "platPlc": title_mock["platPlc"],
                "regstrKindCdNm": "일반건축물",
                "jiyukCdNm": "자연녹지지역",
                "jiguCdNm": "최고고도지구",
                "crtnDay": "20240101"
            }],
            "floor": [
                {"flrNoNm": f"{f}층", "flrArea": 90.0, "purpsCdNm": "공동주택"} for f in range(1, 5)
            ],
            "expos_pubuse": [
                {"flrNo": u["flrNm"], "hoNm": u["hoNm"], "mainPurpsCdNm": u["mainPurpsCdNm"], "area": u["exposSpc"]} for u in exclusive_mock_list
            ],
            "hs_price": [{"hsprc": 210000000, "crtnDay": "20240101"}],
            "expos": [],
            "wclf": [{"wclfModeCdNm": "부패탱크방법", "capaPsper": 20, "capaLube": 3.0}],
            "recap": [],
            "atch_jibun": [],
            "jijigu": []
        }
            
        return {
            "demo_mode": True,
            "parsed_address": parsed_addr,
            "sigungu_code": "11440", # Mock 마포구
            "bdong_code": "10300",   # Mock 아현동
            "title_info": [title_mock],
            "exclusive_info": exclusive_mock_list,
            "all_raw_data": mock_raw_data
        }
