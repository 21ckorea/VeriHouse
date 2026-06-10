import sys
import json
from services.naver_scraper import NaverLandScraper
from services.public_data import PublicDataClient
from services.matcher import DiscrepancyMatcher

def main():
    print("=" * 60)
    print(" VeriHouse - 네이버 부동산 매물 & 건축물대장 검증 엔진 PoC")
    print("=" * 60)
    
    # Check if a URL or ID is passed
    if len(sys.argv) < 2:
        print("\n[사용법] python poc_verify.py [네이버매물URL 또는 매물ID]")
        print("예시: python poc_verify.py 2619080208")
        print("\n* 현재 공공데이터 API 인증키가 미설정된 경우 자동으로 '데모 모드'로 매칭을 시뮬레이션합니다.\n")
        return
        
    input_value = sys.argv[1]
    
    # 1. Initialize Scraper, Client and Matcher
    scraper = NaverLandScraper()
    # Read public data service key if present in env
    client = PublicDataClient()
    matcher = DiscrepancyMatcher()
    
    # 2. Scrape Naver Land
    print(f"\n[1/3] 네이버 부동산에서 매물 정보를 수집 중입니다... (입력값: {input_value})")
    naver_res = scraper.get_article_details(input_value)
    
    if not naver_res.get("success"):
        print(f"❌ 실패: {naver_res.get('message')}")
        return
        
    print(f"✅ 성공!")
    print(f"  - 매물 번호: {naver_res['article_no']}")
    print(f"  - 매물명: {naver_res['title']}")
    print(f"  - 거래 유형: {naver_res['trade_type']}")
    print(f"  - 매물 종류: {naver_res['property_type']}")
    print(f"  - 해당 층/전체 층: {naver_res['floor_info']}")
    print(f"  - 등록 주소: {naver_res['address']}")
    print(f"  - 등록 전용면적: {naver_res['area_exclusive']} ㎡")
    
    # 3. Fetch Building Ledger
    print(f"\n[2/3] 공공데이터포털에서 건축물대장 정보를 조회 중입니다...")
    ledger_res = client.get_building_ledger_data(naver_res['address'])
    
    if ledger_res.get("demo_mode"):
        print("⚠️ 공공데이터 API 인증키가 설정되지 않았거나 조회가 실패하여 [자동 데모 모드]로 시뮬레이션 데이터를 제공합니다.")
    else:
        print("✅ 공공데이터 조회 성공 (실시간 데이터 연동 완료)")
        
    # 4. Compare and Match
    print(f"\n[3/3] 정합성 대조 분석을 실행 중입니다...")
    report = matcher.verify(naver_res, ledger_res)
    
    print("\n" + "=" * 60)
    print(" 📊 분석 리포트 결과 요약")
    print("=" * 60)
    print(f"🔴 위험 지수 (Risk Score): {report['risk_score']} / 100")
    print(f"🔶 위험 레벨 (Risk Level): {report['risk_level']}")
    print(f"💬 종합 평가: {report['summary']}")
    
    # Print mismatches
    mismatches = report["mismatches"]
    if not mismatches:
        print("\n✨ 정합성 오류가 발견되지 않은 안전한 매물입니다!")
    else:
        print(f"\n🚨 총 {len(mismatches)}건의 데이터 불일치가 감지되었습니다:")
        for idx, item in enumerate(mismatches, 1):
            severity_badge = "❌ [심각]" if item["severity"] == "danger" else "⚠️ [경고]"
            print(f"  {idx}. {severity_badge} {item['title']}")
            print(f"     - 내용: {item['message']}")
            print(f"     - 네이버 등록값: {item['naver_value']}")
            print(f"     - 공식 대장값: {item['official_value']}")
            
    print("\n" + "=" * 60)
    print(" 🏠 매칭된 건축물대장 상세 (가장 가까운 후보 호실)")
    print("=" * 60)
    matched = report["matched_unit"]
    if matched:
        print(f"  - 매칭 호실: {matched.get('flrNm', '')} {matched.get('hoNm', '')}")
        print(f"  - 공식 용도: {matched.get('mainPurpsCdNm', '')}")
        print(f"  - 공식 전용면적: {matched.get('exposSpc', '')} ㎡")
        print(f"  - 구조 명칭: {matched.get('strctCdNm', '')}")
    else:
        print("  - 매칭 실패 (대장상 존재하지 않거나 정보 부족)")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
