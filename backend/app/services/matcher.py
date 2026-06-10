import re
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class DiscrepancyMatcher:
    def __init__(self):
        pass

    def parse_floor(self, floor_str) -> Optional[int]:
        """
        Parses floor string (e.g., "3", "지하1", "B1") and returns it as integer.
        Basement/地下 is returned as negative number.
        """
        if floor_str is None:
            return None

        # int/float이 직접 넘어올 경우 문자열로 변환
        if isinstance(floor_str, (int, float)):
            return int(floor_str)

        floor_clean = str(floor_str).strip().lower()

        if not floor_clean:
            return None

        # Split by slash if it's like "3/4" (current floor / total floors)
        if '/' in floor_clean:
            floor_clean = floor_clean.split('/')[0]

        # Check for underground / basement
        is_basement = False
        if any(x in floor_clean for x in ["지하", "b", "반지하"]):
            is_basement = True

        # Extract digits
        digits = "".join(re.findall(r'\d+', floor_clean))
        if not digits:
            return None

        val = int(digits)
        return -val if is_basement else val

    def extract_room_number(self, text: str) -> Optional[str]:
        """
        Extracts room number (e.g. "302호", "201") from title or description.
        """
        if not text:
            return None
            
        # Look for patterns like "302호", "101호", "B01호"
        match = re.search(r'\b([bB]?\d+)\s*호\b', text)
        if match:
            return match.group(1).upper() + "호"
            
        # Search for raw 3-4 digit numbers that might represent a room
        # We avoid matching years like 2023, 2024 or areas like 84, 59.
        # Usually room numbers are 101, 102, 201, 202, 301, 302, 401, 402, 501 etc.
        room_patterns = r'\b([1-9]0[1-9]|[1-9]0[1-9]호)\b'
        match_room = re.search(room_patterns, text)
        if match_room:
            val = match_room.group(1)
            if not val.endswith("호"):
                val += "호"
            return val
            
        return None

    def match_unit(self, naver_listing: Dict[str, Any], exclusive_info: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Tries to match the Naver Real Estate listing to the correct unit in the Building Register.
        Returns a list of candidate units.
        """
        if not exclusive_info:
            return []
            
        # 1. Parse floor number from Naver listing
        naver_floor_str = naver_listing.get("floor_info", "")
        naver_floor = self.parse_floor(naver_floor_str)
        
        # 2. Try to find a room number from description or title
        room_from_desc = self.extract_room_number(naver_listing.get("description", ""))
        room_from_title = self.extract_room_number(naver_listing.get("title", ""))
        target_room = room_from_desc or room_from_title
        
        logger.info(f"Matching unit: naver_floor={naver_floor}, target_room={target_room}")
        
        candidates = []
        
        # Let's clean and normalize the exclusive info floor names and room names
        # Building Register typically has flrNm as "1층", "지하1층" and hoNm as "101호" or empty.
        for unit in exclusive_info:
            unit_floor_str = unit.get("flrNm", "")
            unit_floor = self.parse_floor(unit_floor_str)
            unit_room = unit.get("hoNm", "").strip()
            
            # Exact match by room name (if target_room is known)
            if target_room and unit_room and (target_room == unit_room or target_room.replace("호", "") == unit_room.replace("호", "")):
                return [unit] # Perfect exact match!
                
            # Match by floor first if room name is not specified or not matching
            if naver_floor is not None and unit_floor == naver_floor:
                candidates.append(unit)
                
        # If we have floor-based candidates, filter them by area similarity
        if candidates and len(candidates) > 1:
            naver_area = naver_listing.get("area_exclusive", 0.0)
            # Sort candidates by area difference
            candidates.sort(key=lambda x: abs(float(x.get("exposSpc", 0.0)) - naver_area))
            
            # If the closest candidate is extremely close in area (< 1m² difference), we prioritize it
            closest_diff = abs(float(candidates[0].get("exposSpc", 0.0)) - naver_area)
            if closest_diff < 1.0:
                return [candidates[0]]
                
        return candidates

    def verify(self, naver_listing: Dict[str, Any], ledger_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs discrepancy checking logic.
        """
        mismatches = []
        risk_score = 0
        
        # Extract data sources
        title_info = ledger_data.get("title_info", [])
        exclusive_info = ledger_data.get("exclusive_info", [])
        
        # Primary Building Title Info
        title_unit = title_info[0] if title_info else {}
        viol_yn = str(title_unit.get("violBldYn", "N")).strip()
        main_purps_building = title_unit.get("mainPurpsCdNm", "")
        
        # A. Check for registered violation building status (위반건축물 여부)
        if viol_yn == "Y":
            mismatches.append({
                "category": "violation",
                "severity": "danger",
                "title": "공식 위반건축물 등재 매물",
                "message": "해당 건물은 공적 장부(건축물대장)상 '위반건축물'로 정식 등재되어 있습니다. 이행강제금 부과, 전세자금대출 거절 등의 심각한 불이익이 발생할 수 있습니다. 네이버 매물에는 고지되지 않았을 수 있습니다.",
                "naver_value": "일반 매물",
                "official_value": "위반건축물 (Y)"
            })
            risk_score += 40

        # A-2. [NEW] Check Land Area Discrepancy (대지면적 불일치 검증)
        naver_land_area = float(naver_listing.get("area_land", 0.0) or 0.0)
        official_land_area = float(title_unit.get("platArea", 0.0) or 0.0)
        
        if naver_land_area > 0 and official_land_area > 0:
            diff_land = abs(naver_land_area - official_land_area)
            if diff_land > 0.01: # 0.01m2 threshold
                severity = "warning"
                score_add = 10
                if diff_land > 2.0: # 2m2 이상 오차는 주의 필요
                    severity = "warning"
                    score_add = 20
                    
                mismatches.append({
                    "category": "land_area",
                    "severity": severity,
                    "title": f"대지면적 불일치 (오차 {diff_land:.1f}㎡)",
                    "message": f"네이버 부동산 등록 대지면적과 실제 건축물대장 표제부상의 공식 대지면적이 서로 다릅니다. 단독/전원주택 거래 시 토지 지분 침범이나 소유권 분쟁 대상이 될 수 있으므로 계약 전에 토지대장을 필히 대조해야 합니다.",
                    "naver_value": f"{naver_land_area}㎡",
                    "official_value": f"{official_land_area}㎡"
                })
                risk_score += score_add

        # Try to match to a specific unit (호실)
        candidates = self.match_unit(naver_listing, exclusive_info)
        matched_unit = None
        
        # Check if the building is a condominium/collective building (집합건물) vs general building (일반건물: 단독, 다가구 등)
        regstr_gb_nm = title_unit.get("regstrGbCdNm", "")
        regstr_kind_nm = title_unit.get("regstrKindCdNm", "")
        is_condo = "집합" in str(regstr_gb_nm) or "집합" in str(regstr_kind_nm) or bool(exclusive_info)
        
        if not candidates:
            # Could not match to any unit on that floor
            # ONLY raise a matching discrepancy for collective buildings where separate units are registered
            if is_condo and len(exclusive_info) > 0:
                mismatches.append({
                    "category": "matching",
                    "severity": "warning",
                    "title": "건축물대장 호실 정보 불일치",
                    "message": f"네이버 매물에 명시된 층({naver_listing.get('floor_info', '알수없음')})과 면적({naver_listing.get('area_exclusive', 0)}㎡)에 부합하는 호실을 건축물대장 전유부에서 찾을 수 없습니다. 미등기 혹은 불법 개조(구조 변경) 매물일 가능성이 있습니다.",
                    "naver_value": f"{naver_listing.get('floor_info', '')}층 / {naver_listing.get('area_exclusive', '')}㎡",
                    "official_value": "일치하는 호실 없음"
                })
                risk_score += 20
        else:
            # We matched one or more candidates
            # Let's look at the best matched unit
            matched_unit = candidates[0]
            
            # B. Check for Neighborhood Living Facility illegal conversion (근생빌라 여부)
            unit_purps = matched_unit.get("mainPurpsCdNm", "")
            is_commercial = any(x in unit_purps for x in ["근린생활", "사무소", "상가", "점포", "의원"])
            
            # If the user is listing it as a residential property type (VL=빌라, APT=아파트, OR=오피스텔 등) but it's listed as commercial in ledger
            if is_commercial:
                mismatches.append({
                    "category": "commercial_use",
                    "severity": "danger",
                    "title": "근생빌라 의심 (불법 주거용 용도변경)",
                    "message": f"대장상 용도가 '{unit_purps}'로 되어 있어 주거용으로 사용할 수 없는 상가 건물을 주택으로 불법 개조한 '근생빌라'로 강하게 의심됩니다. 세입자 전세 대출 불가 및 상시적인 원상복구 이행강제금 대상이 될 수 있습니다.",
                    "naver_value": f"주거용 매물 ({naver_listing.get('property_type', '')})",
                    "official_value": f"{unit_purps} (상업용)"
                })
                risk_score += 50
                
            # C. Check Area Discrepancy (면적 불일치)
            naver_area = float(naver_listing.get("area_exclusive", 0.0))
            official_area = float(matched_unit.get("exposSpc", 0.0))
            
            if official_area > 0:
                diff_percentage = abs(naver_area - official_area) / official_area
                if diff_percentage > 0.02: # 2% threshold
                    severity = "warning"
                    score_add = 15
                    if diff_percentage > 0.10: # > 10% mismatch is severe
                        severity = "danger"
                        score_add = 30
                        
                    mismatches.append({
                        "category": "area",
                        "severity": severity,
                        "title": f"전용면적 불일치 (오차 {diff_percentage*100:.1f}%)",
                        "message": f"네이버에 표시된 전용면적과 실제 건축물대장 전유부 전용면적이 다릅니다. 실제 면적이 더 작거나 과장 표기되었을 수 있으므로 계약 전 실사 확인이 필요합니다.",
                        "naver_value": f"{naver_area}㎡",
                        "official_value": f"{official_area}㎡"
                    })
                    risk_score += score_add

            # D. Check Floor Discrepancy (반지하 / 지하 세탁 여부)
            naver_floor_str = naver_listing.get("floor_info", "")
            naver_floor = self.parse_floor(naver_floor_str)
            official_floor = self.parse_floor(matched_unit.get("flrNm", ""))
            
            if naver_floor is not None and official_floor is not None:
                # If Naver says positive floor (e.g. 1층) but official is negative (지하 1층)
                if naver_floor >= 1 and official_floor < 0:
                    mismatches.append({
                        "category": "floor",
                        "severity": "danger",
                        "title": "반지하/지하 층수 오도 의심",
                        "message": "네이버 매물 정보에는 지상층(예: 1층)으로 기재되어 있으나, 공식 건축물대장상에는 '지하 1층(반지하)'으로 등재되어 있습니다. 채광, 습기 및 홍수 리스크가 큰 지하 매물을 숨기기 위한 층수 변경 수법일 수 있습니다.",
                        "naver_value": f"{naver_floor_str}",
                        "official_value": f"{matched_unit.get('flrNm', '')}"
                    })
                    risk_score += 35
                elif naver_floor != official_floor:
                    mismatches.append({
                        "category": "floor",
                        "severity": "warning",
                        "title": "매물 층수 불일치",
                        "message": "네이버 매물에 등록된 층수와 대장상 실재하는 호실의 층수가 서로 다릅니다.",
                        "naver_value": f"{naver_floor_str}",
                        "official_value": f"{matched_unit.get('flrNm', '')}"
                    })
                    risk_score += 10

        # E. Check for unapproved Duplex (무단 증축 복층 의심)
        desc_text = naver_listing.get("description", "").lower()
        if "복층" in desc_text or "다락방" in desc_text:
            # Let's check if the building ledger mentions duplex/다락 or total height is enough, or flag as general caution
            mismatches.append({
                "category": "duplex",
                "severity": "warning",
                "title": "무단 복층 증축 의심",
                "message": "매물 설명글에 '복층' 구조가 명시되어 있으나, 다세대/빌라 주택의 무단 복층 개조는 불법 위반건축물 단속 단골 대상입니다. 적법한 허가를 받은 복층인지 관할 구청을 통해 대장 확인이 반드시 필요합니다.",
                "naver_value": "복층/다락 구조 설명 포함",
                "official_value": "특이사항 확인 필요 (불법 복층 주의)"
            })
            risk_score += 15

        # Cap risk score at 100
        risk_score = min(risk_score, 100)
        
        # Classify overall risk level
        if risk_score >= 60:
            risk_level = "위험 (High Risk)"
            summary_msg = "이 매물은 중대한 공부상 정합성 오류 및 불법 위반(근생빌라, 지하 세탁, 위반건축물 등)이 강력하게 의심됩니다. 거래 시 극도로 주의하십시오."
        elif risk_score >= 20:
            risk_level = "의심 (Caution)"
            summary_msg = "일부 세부 항목(면적 오차, 층수 불일치, 복층 의심 등)에서 장부와의 정합성 차이가 발견되어 사전 확인이 권장되는 매물입니다."
        else:
            risk_level = "안전 (Safe)"
            summary_msg = "공식 공부 정보(건축물대장)와 네이버 매물 정보가 거의 일치하며, 불법적인 용도 변경이나 위반 건축 흔적이 발견되지 않은 비교적 안전한 매물입니다."
            
        # Extract total building area from title_unit (연면적)
        official_total_area = float(title_unit.get("totArea", 0.0) or 0.0)

        return {
            "is_valid": len([m for m in mismatches if m["severity"] == "danger"]) == 0,
            "mismatches": mismatches,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "summary": summary_msg,
            "matched_unit": matched_unit,
            "official_land_area": official_land_area, # [NEW] 공식 대지면적
            "official_total_area": official_total_area, # [NEW] 공식 연면적
            "demo_mode": ledger_data.get("demo_mode", False),
            "parsed_address": ledger_data.get("parsed_address", {})
        }
