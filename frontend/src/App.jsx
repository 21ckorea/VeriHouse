import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Building2, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  ShieldAlert, 
  History, 
  Sparkles, 
  FileText, 
  MapPin, 
  Activity, 
  ExternalLink,
  Lock,
  Layers,
  Ruler,
  Home,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Scale,
  Database,
  Eye,
  User,
  Wallet,
  Bus,
  Download
} from 'lucide-react';
import './App.css';
import { generateLedgerPdf } from './generateLedgerPdf';
import LedgerPage from './LedgerPage';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function App() {
  const [currentView, setCurrentView] = useState('main'); // 'main' | 'ledger'
  const [inputValue, setInputValue] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    total_verified: 0,
    danger_count: 0,
    warning_count: 0,
    safe_count: 0,
    average_risk_score: 0.0
  });
  const [activePreset, setActivePreset] = useState('');
  const [error, setError] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [showRawLedger, setShowRawLedger] = useState(false);
  const [activeTab, setActiveTab] = useState('comparison'); // 'comparison', 'mismatches', 'ledger'

  // Demo presets for easy testing
  const presets = [
    {
      id: 'daegu-land',
      name: '🏡 대구 중대동 전원주택',
      desc: '대지면적 불일치 (네이버 1058㎡ vs 대장 1055㎡) 감지 테스트',
      value: '2628219938'
    },
    {
      id: 'danger-use',
      name: '🚨 근생빌라 의심 매물',
      desc: '상가를 빌라로 무단 개조한 매물 테스트',
      value: '2619080201'
    },
    {
      id: 'warn-area',
      name: '⚠️ 면적/층수 불일치',
      desc: '대장과 면적이 다르거나 층수 오차가 큰 매물 테스트',
      value: '2619080203'
    },
    {
      id: 'safe-apt',
      name: '✨ 안전 아파트 매물',
      desc: '대장 정보와 일치하는 안전한 매물 테스트',
      value: '2619080204'
    }
  ];

  useEffect(() => {
    fetchHistoryAndStats();
  }, []);

  const fetchHistoryAndStats = async () => {
    try {
      const historyRes = await fetch(`${API_BASE}/api/history`);
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistory(historyData);
      }
      
      const statsRes = await fetch(`${API_BASE}/api/stats`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error('Failed to fetch history/stats:', err);
    }
  };

  const handleVerify = async (val = inputValue) => {
    if (!val.trim()) {
      setError('네이버 부동산 매물 링크 또는 10자리 ID를 입력해주세요.');
      return;
    }
    
    setError('');
    setLoading(true);
    setReport(null);
    setActiveTab('comparison');
    
    try {
      const response = await fetch(`${API_BASE}/api/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url_or_id: val.trim(),
          service_key: serviceKey.trim() || null
        })
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || '매물을 분석하지 못했습니다.');
      }
      
      const data = await response.json();
      setReport(data);
      fetchHistoryAndStats();
    } catch (err) {
      setError(err.message || '네트워크 통신 중 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (preset) => {
    setActivePreset(preset.id);
    setInputValue(preset.value);
    handleVerify(preset.value);
  };

  const formatPrice = (priceInfo, tradeType) => {
    if (!priceInfo) return '-';
    const formatManwon = (amount) => {
      if (amount >= 10000) {
        const eok = Math.floor(amount / 10000);
        const rest = amount % 10000;
        return `${eok}억 ${rest > 0 ? rest.toLocaleString() : ''}만원`;
      }
      return `${amount.toLocaleString()}만원`;
    };

    if (tradeType === '매매') return `매매 ${formatManwon(priceInfo.dealPrice)}`;
    if (tradeType === '전세') return `전세 ${formatManwon(priceInfo.warrantyPrice)}`;
    if (tradeType === '월세') return `월세 ${formatManwon(priceInfo.warrantyPrice)} / ${priceInfo.rentPrice}만원`;
    return '-';
  };

  // SVG parameters for the circular Risk Score gauge
  const radius = 70;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius;
  const score = report?.analysis_report?.risk_score || 0;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getRiskColor = (riskVal) => {
    if (riskVal >= 60) return '#EF4444';
    if (riskVal >= 20) return '#F59E0B';
    return '#10B981';
  };

  const getRiskClass = (riskVal) => {
    if (riskVal >= 60) return 'danger';
    if (riskVal >= 20) return 'warning';
    return 'safe';
  };

  // Helper: get title_info from report
  const getTitleInfo = () => {
    if (report?.ledger_details?.title_info?.length > 0) {
      return report.ledger_details.title_info[0];
    }
    return null;
  };

  // Build detailed comparison rows
  const buildComparisonRows = () => {
    if (!report) return [];
    const listing = report.listing_details;
    const analysis = report.analysis_report;
    const titleInfo = getTitleInfo();
    const matchedUnit = analysis?.matched_unit;
    
    const rows = [];

    rows.push({
      section: '기본 정보',
      label: '등록 가격',
      icon: <Wallet size={16} />,
      naverVal: formatPrice(listing.price_info, listing.trade_type),
      officialVal: '-',
      match: true,
      category: 'info'
    });
        
    rows.push({
      section: '기본 정보',
      label: '소재지 주소',
      icon: <MapPin size={16} />,
      naverVal: listing.address || '-',
      officialVal: titleInfo?.platPlc || analysis?.parsed_address?.raw_address || '-',
      match: true,
      category: 'info'
    });

    const isUseMatch = titleInfo?.mainPurpsCdNm ? (
      listing.property_type.includes(titleInfo.mainPurpsCdNm.replace('주택', '')) ||
      titleInfo.mainPurpsCdNm.includes(listing.property_type.replace('주택', '')) ||
      (listing.property_type === '빌라' && titleInfo.mainPurpsCdNm.includes('공동')) ||
      (listing.property_type === '아파트' && titleInfo.mainPurpsCdNm.includes('공동')) ||
      (listing.property_type === '단독주택' && titleInfo.mainPurpsCdNm.includes('단독'))
    ) : false;

    rows.push({
      section: '기본 정보',
      label: '건물 용도',
      icon: <Home size={16} />,
      naverVal: `${listing.property_type} (${listing.trade_type})`,
      officialVal: titleInfo?.mainPurpsCdNm || '-',
      match: isUseMatch && !analysis?.mismatches?.some(m => m.category === 'commercial_use'),
      category: 'check'
    });

    const naverHh = listing.building_info?.household_number || 0;
    const officialHh = titleInfo?.hhldCnt || 0;
    rows.push({
      section: '건축물 정보',
      label: '세대수',
      icon: <Home size={16} />,
      naverVal: naverHh ? `${naverHh}세대` : '-',
      officialVal: officialHh ? `${officialHh}세대` : '-',
      match: naverHh === officialHh,
      category: 'check',
      highlight: naverHh !== officialHh && naverHh > 0 && officialHh > 0
    });

    const naverPark = listing.building_info?.parking_count || 0;
    const officialPark = titleInfo?.totPkngCnt || 0;
    rows.push({
      section: '건축물 정보',
      label: '주차대수',
      icon: <Building2 size={16} />,
      naverVal: naverPark !== null && naverPark !== undefined ? `${naverPark}대` : '-',
      officialVal: officialPark !== null && officialPark !== undefined ? `${officialPark}대` : '-',
      match: String(naverPark) === String(officialPark),
      category: 'check',
      highlight: String(naverPark) !== String(officialPark) && (naverPark || officialPark)
    });

    const naverFAR = listing.building_info?.floor_area_ratio;
    const naverBCR = listing.building_info?.building_coverage_ratio;
    const offFAR = titleInfo?.vlRat;
    const offBCR = titleInfo?.bcRat;

    const parseRatio = (v) => {
      if (!v) return null;
      const clean = String(v).replace(/%/g, '').trim();
      return isNaN(Number(clean)) ? null : Number(clean);
    };
    const nf = parseRatio(naverFAR);
    const nb = parseRatio(naverBCR);
    const of_ = parseRatio(offFAR);
    const ob = parseRatio(offBCR);
    const farMatch = (nf && of_) ? Math.abs(nf - of_) < 0.1 : true;
    const bcrMatch = (nb && ob) ? Math.abs(nb - ob) < 0.1 : true;
    const ratioMatch = farMatch && bcrMatch;

    rows.push({
      section: '건축물 정보',
      label: '용적률 / 건폐율',
      icon: <Activity size={16} />,
      naverVal: (naverFAR || naverBCR) ? `${naverFAR || 0}% / ${naverBCR || 0}%` : '-',
      officialVal: (offFAR || offBCR) ? `${offFAR || 0}% / ${offBCR || 0}%` : '-',
      match: ratioMatch,
      category: 'check',
      highlight: !ratioMatch
    });

    const naverPurp = listing.building_info?.land_purpose || '-';
    const naverDist = listing.building_info?.land_district || '-';
    const offPurp = report.ledger_details?.all_raw_data?.basis?.[0]?.jiyukCdNm || '-';
    const offDist = report.ledger_details?.all_raw_data?.basis?.[0]?.jiguCdNm || '-';

    const cleanStr = (s) => String(s || '').replace(/\s+/g, '').replace(/-/g, '');
    const isPurpMatch = (naverPurp === '-' || offPurp === '-') ? true : (cleanStr(naverPurp).includes(cleanStr(offPurp)) || cleanStr(offPurp).includes(cleanStr(naverPurp)));
    const isDistMatch = (naverDist === '-' || offDist === '-') ? true : (cleanStr(naverDist).includes(cleanStr(offDist)) || cleanStr(offDist).includes(cleanStr(naverDist)));
    const isAreaDistrictMatch = isPurpMatch && isDistMatch;

    rows.push({
      section: '건축물 정보',
      label: '지역 / 지구',
      icon: <MapPin size={16} />,
      naverVal: `${naverPurp} / ${naverDist}`,
      officialVal: `${offPurp} / ${offDist}`,
      match: isAreaDistrictMatch,
      category: 'check',
      highlight: !isAreaDistrictMatch
    });

    const naverLandArea = listing.area_land || 0;
    const officialLandArea = analysis?.official_land_area || titleInfo?.platArea || 0;
    const landAreaMatch = !analysis?.mismatches?.some(m => m.category === 'land_area');
    rows.push({
      section: '기본 정보',
      label: '대지면적',
      icon: <Layers size={16} />,
      naverVal: naverLandArea > 0 ? `${naverLandArea}㎡` : '미기재',
      officialVal: officialLandArea > 0 ? `${officialLandArea}㎡` : '미기재',
      match: landAreaMatch,
      diff: (naverLandArea > 0 && officialLandArea > 0) ? `차이: ${Math.abs(naverLandArea - officialLandArea).toFixed(1)}㎡` : null,
      category: 'check',
      highlight: !landAreaMatch
    });

    const naverExArea = listing.area_exclusive || 0;
    const officialExArea = matchedUnit ? parseFloat(matchedUnit.exposSpc || 0) : 0;
    const areaMatch = !analysis?.mismatches?.some(m => m.category === 'area');
    rows.push({
      section: '기본 정보',
      label: '전용면적',
      icon: <Ruler size={16} />,
      naverVal: naverExArea > 0 ? `${naverExArea}㎡` : '미기재',
      officialVal: officialExArea > 0 ? `${officialExArea}㎡` : matchedUnit ? '매칭불가' : '-',
      match: areaMatch,
      diff: (naverExArea > 0 && officialExArea > 0) ? `차이: ${Math.abs(naverExArea - officialExArea).toFixed(2)}㎡ (${(Math.abs(naverExArea - officialExArea) / officialExArea * 100).toFixed(1)}%)` : null,
      category: 'check',
      highlight: !areaMatch
    });

    rows.push({
      section: '기본 정보',
      label: '공급면적',
      icon: <Ruler size={16} />,
      naverVal: listing.area_supply > 0 ? `${listing.area_supply}㎡` : '미기재',
      officialVal: '-',
      match: true,
      category: 'info'
    });

    const naverTotalArea = listing.area_total || 0;
    const officialTotalArea = analysis?.official_total_area || titleInfo?.totArea || 0;
    const totalAreaMatch = (naverTotalArea > 0 && officialTotalArea > 0)
      ? (Math.abs(naverTotalArea - officialTotalArea) / officialTotalArea <= 0.02 || Math.abs(naverTotalArea - officialTotalArea) <= 1.0)
      : false;
    rows.push({
      section: '기본 정보',
      label: '연면적',
      icon: <Layers size={16} />,
      naverVal: naverTotalArea > 0 ? `${naverTotalArea}㎡` : '미기재',
      officialVal: officialTotalArea > 0 ? `${officialTotalArea}㎡` : '미기재',
      match: totalAreaMatch,
      diff: (naverTotalArea > 0 && officialTotalArea > 0) ? `차이: ${Math.abs(naverTotalArea - officialTotalArea).toFixed(2)}㎡` : null,
      category: 'check',
      highlight: !totalAreaMatch && naverTotalArea > 0 && officialTotalArea > 0
    });

    let floorMatch = true;
    if (matchedUnit) {
      floorMatch = !analysis?.mismatches?.some(m => m.category === 'floor');
    } else if (titleInfo) {
      const naverFloorStr = listing.floor_info || '';
      const currentFloorMatch = naverFloorStr.match(/^(\d+)층/i) || naverFloorStr.match(/^지하\s*(\d+)층/i) || naverFloorStr.match(/^B\s*(\d+)/i) || naverFloorStr.match(/^(\d+)\//);
      if (currentFloorMatch) {
        let floorVal = parseInt(currentFloorMatch[1]);
        if (naverFloorStr.includes('지하') || naverFloorStr.toLowerCase().startsWith('b')) {
          floorVal = -floorVal;
        }
        const grndLimit = parseInt(titleInfo.grndFlrCnt || 0);
        const ugrndLimit = parseInt(titleInfo.ugrndFlrCnt || 0);
        if (floorVal > 0 && floorVal > grndLimit) floorMatch = false;
        if (floorVal < 0 && Math.abs(floorVal) > ugrndLimit) floorMatch = false;
      }
    }
    rows.push({
      section: '기본 정보',
      label: '해당 층',
      icon: <Building2 size={16} />,
      naverVal: listing.floor_info || '-',
      officialVal: matchedUnit?.flrNm || (titleInfo ? `건물 전체 (지상 ${titleInfo.grndFlrCnt}층/지하 ${titleInfo.ugrndFlrCnt}층)` : '-'),
      match: floorMatch,
      category: 'check',
      highlight: !floorMatch
    });

    rows.push({
      section: '기본 정보',
      label: '방/화장실',
      icon: <Home size={16} />,
      naverVal: `${listing.room_count || '-'}개 / ${listing.bathroom_count || '-'}개`,
      officialVal: '-',
      match: true,
      category: 'info'
    });

    const violMatch = !analysis?.mismatches?.some(m => m.category === 'violation');
    rows.push({
      section: '건축물 정보',
      label: '위반건축물 여부',
      icon: <ShieldAlert size={16} />,
      naverVal: '고지 없음',
      officialVal: titleInfo?.violBldYn === 'Y' ? '위반건축물 (Y)' : '정상 (N)',
      match: violMatch,
      category: 'check',
      highlight: !violMatch
    });

    const naverStrct = listing.building_info?.structure;
    const offStrct = matchedUnit?.strctCdNm || titleInfo?.strctCdNm || '-';
    const offEtcStrct = matchedUnit?.etcStrct || titleInfo?.etcStrct || '';
    const fullOffStrct = offEtcStrct ? `${offStrct} (${offEtcStrct})` : offStrct;
    const isStrctMatch = (naverStrct && offStrct !== '-') ? (
      cleanStr(naverStrct).includes(cleanStr(offStrct)) ||
      cleanStr(offStrct).includes(cleanStr(naverStrct)) ||
      cleanStr(naverStrct).includes(cleanStr(offEtcStrct)) ||
      cleanStr(offEtcStrct).includes(cleanStr(naverStrct))
    ) : true;

    rows.push({
      section: '건축물 정보',
      label: '건물 구조',
      icon: <Building2 size={16} />,
      naverVal: naverStrct || '-',
      officialVal: fullOffStrct,
      match: isStrctMatch,
      category: 'check',
      highlight: !isStrctMatch
    });

    const naverApproval = listing.building_info?.use_approval_date;
    const offApproval = titleInfo?.useAprvDay;
    const normalizeDate = (d) => String(d || '').replace(/\D/g, '');
    const isApprovalMatch = (naverApproval && offApproval)
      ? normalizeDate(naverApproval) === normalizeDate(offApproval)
      : true;

    rows.push({
      section: '건축물 정보',
      label: '사용승인일',
      icon: <FileText size={16} />,
      naverVal: naverApproval ? `${naverApproval.substring(0,4)}.${naverApproval.substring(4,6)}.${naverApproval.substring(6,8)}` : '-',
      officialVal: offApproval ? `${offApproval.substring(0,4)}.${offApproval.substring(4,6)}.${offApproval.substring(6,8)}` : '-',
      match: isApprovalMatch,
      category: 'check',
      highlight: !isApprovalMatch
    });

    if (listing.agent?.brokerage_name) {
      rows.push({
        section: '중개사',
        label: '중개사',
        icon: <User size={16} />,
        naverVal: `${listing.agent.brokerage_name} ${listing.agent.broker_name ? `(${listing.agent.broker_name})` : ''}`,
        officialVal: '-',
        match: true,
        category: 'info'
      });
    }

    if (listing.agent_fee?.fee > 0) {
      rows.push({
        section: '중개 보수',
        label: '중개 보수',
        icon: <Wallet size={16} />,
        naverVal: `최대 ${Math.floor(listing.agent_fee.fee / 10000).toLocaleString()}만원`,
        officialVal: '-',
        match: true,
        category: 'info'
      });
    }

    if (listing.tax_info?.total > 0) {
      rows.push({
        section: '세금',
        label: '취득세 합계',
        icon: <Wallet size={16} />,
        naverVal: `약 ${Math.floor(listing.tax_info.total / 10000).toLocaleString()}만원`,
        officialVal: '-',
        match: true,
        category: 'info'
      });
    }

    if (listing.tax_info?.acquisition_tax > 0) {
      rows.push({
        section: '세금',
        label: '취득세',
        icon: <Wallet size={16} />,
        naverVal: `${Math.floor(listing.tax_info.acquisition_tax / 10000).toLocaleString()}만원`,
        officialVal: '-',
        match: true,
        category: 'info'
      });
    }
    if (listing.tax_info?.local_tax > 0) {
      rows.push({
        section: '세금',
        label: '지방교육세',
        icon: <Wallet size={16} />,
        naverVal: `${Math.floor(listing.tax_info.local_tax / 10000).toLocaleString()}만원`,
        officialVal: '-',
        match: true,
        category: 'info'
      });
    }

    if (listing.transport) {
      const transStr = [listing.transport.bus, listing.transport.metro]
        .filter(t => t && t.trim().length > 0)
        .join(' / ');
      if (transStr) {
        rows.push({
          section: '주변 대중교통',
          label: '주변 대중교통',
          icon: <Bus size={16} />,
          naverVal: transStr,
          officialVal: '-',
          match: true,
          category: 'info'
        });
      }
    }

    const filteredRows = rows.filter(row => {
      if (row.label === '위반건축물 여부') return true;
      
      const val = String(row.naverVal).trim();
      return val !== '-' && val !== '미기재' && val !== '- / -' && val !== '-개 / -개';
    });

    return filteredRows;
  };

  
  // Group rows by section
  const groupedComparison = {};
  if (report) {
    const comparisonRows = buildComparisonRows();
    const sectionOrder = ['기본 정보', '건축물 정보', '중개사', '중개 보수', '세금', '주변 대중교통'];
    
    // Initialize empty arrays in specified order
    sectionOrder.forEach(sec => groupedComparison[sec] = []);
    
    comparisonRows.forEach(row => {
      if (!groupedComparison[row.section]) groupedComparison[row.section] = [];
      groupedComparison[row.section].push(row);
    });
  }
        
  if (currentView === 'ledger') {
    return <LedgerPage onBack={() => setCurrentView('main')} />;
  }
        
  return (
    <div className="dashboard-container">
      {/* Header Navigation */}
      <header className="header-nav">
        <div className="logo-group">
          <Building2 size={32} className="logo-icon" />
          <span className="logo-text">VeriHouse</span>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={() => setCurrentView('ledger')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1.1rem',
              borderRadius: '20px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid var(--primary)',
              color: 'var(--primary)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <FileText size={14} />
            건축물대장 직접 조회 · PDF
          </button>

          <button 
            className="demo-chip"
            onClick={() => setShowConfig(!showConfig)}
            style={{ borderColor: serviceKey ? 'var(--primary)' : 'var(--border-color)' }}
          >
            <Lock size={14} />
            {serviceKey ? '공공 API 키 설정됨' : '공공 API 키 설정'}
          </button>
          
          <div className="badge-demo">
            <Sparkles size={14} />
            <span>실시간 대조 모드 활성</span>
          </div>
        </div>
      </header>

      {/* API Key configuration */}
      {showConfig && (
        <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', animation: 'fadeIn 0.3s ease' }}>
          <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={16} className="logo-icon" />
            공공데이터포털 건축물대장 API 인증키 설정
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: '1.5' }}>
            국토교통부 건축물대장정보 서비스의 활용승인 후 발급받은 '인증키(Service Key - Decoding)'를 입력하세요.<br />
            입력하지 않거나 유효하지 않은 경우, 분석 엔진이 자동으로 <strong>'데모 모드(Demo Mode)'</strong> 시뮬레이션으로 작동합니다.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="인증키를 입력하세요..."
              value={serviceKey}
              onChange={(e) => setServiceKey(e.target.value)}
              className="search-input"
              style={{ paddingLeft: '1.25rem' }}
            />
            <button className="btn-verify" style={{ height: 'auto', padding: '0 1.5rem' }} onClick={() => setShowConfig(false)}>
              저장
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero-section">
        <h1 className="hero-title">
          네이버 부동산 매물 <span style={{ color: 'var(--primary)' }}>공부 대조</span> 검증 시스템
        </h1>
        <p className="hero-subtitle">
          매물 링크나 ID만 입력하면 건축물대장의 실시간 전유부/표제부 데이터와 비교 분석하여 근생빌라, 면적 위반, 층수 세탁 등 불법 요소를 즉시 포착합니다.
        </p>
      </section>

      {/* Search Input Box */}
      <section className="glass-panel search-card">
        <div className="search-form">
          <div className="input-wrapper">
            <Search className="search-icon-left" size={20} />
            <input
              type="text"
              placeholder="네이버 부동산 매물 URL 주소 또는 10자리 매물 ID를 입력하세요... (예: 2628219938)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              className="search-input"
            />
          </div>
          <button 
            className="btn-verify" 
            onClick={() => handleVerify()}
            disabled={loading}
          >
            {loading ? '검증 분석 중...' : '매물 정합성 검증'}
          </button>
        </div>

        {/* Demo scenarios */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="demo-preset-group" style={{ margin: 0 }}>
            <span className="demo-label">⚡ 빠른 데모 체험:</span>
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`demo-chip ${activePreset === preset.id ? 'active' : ''}`}
                onClick={() => handlePresetClick(preset)}
                title={preset.desc}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentView('ledger')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
              e.currentTarget.style.color = 'var(--primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'var(--text-main)';
            }}
          >
            <span>도로명/지번 주소로 직접 발급하기</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* Error alert banner */}
      {error && (
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '2rem', borderColor: 'var(--danger)', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertTriangle color="var(--danger)" size={20} />
          <span style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 600 }}>{error}</span>
        </div>
      )}

      {/* Loading state indicator */}
      {loading && (
        <div className="glass-panel loading-box">
          <div className="spinner"></div>
          <p className="loading-text">네이버 부동산 및 대한민국 건축물대장 API 실시간 대조 데이터 분석 중...</p>
        </div>
      )}

      {/* ============ VERIFICATION REPORT RESULTS ============ */}
      {report && !loading && (
        <section className="report-section">
          {/* Risk Overview Grid */}
          <div className="glass-panel risk-overview-card">
            <div className="gauge-col">
              <div className="risk-circle">
                <svg className="svg-circle" width="180" height="180">
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="transparent"
                    stroke="rgba(255,255,255,0.03)"
                    strokeWidth={strokeWidth}
                  />
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="transparent"
                    stroke={getRiskColor(score)}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  />
                </svg>
                <div className="risk-score-display">
                  <span className="risk-num" style={{ color: getRiskColor(score) }}>{score}</span>
                  <span className="risk-den">/100</span>
                </div>
              </div>
              <div className="risk-label-group">
                <span className={`risk-badge ${getRiskClass(score)}`}>
                  {report.analysis_report.risk_level}
                </span>
              </div>
            </div>

            <div>
              <h2 className="summary-title" style={{ color: getRiskColor(score) }}>
                {score >= 60 ? '🚨 경고: 거래 위험 매물' : score >= 20 ? '⚠️ 주의: 기재 정합성 의심 매물' : '✨ 검증 완료: 정상 등재 매물'}
              </h2>
              <p className="summary-desc">{report.analysis_report.summary}</p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {report.analysis_report.demo_mode && (
                  <span className="badge-demo" style={{ background: 'var(--warning-glow)', color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                    <Info size={12} />
                    <span>공공 API 데모 시뮬레이션 적용됨</span>
                  </span>
                )}
                {report.listing_details?.simulation_mode && (
                  <span className="badge-demo" style={{ background: 'var(--info-glow)', color: 'var(--info)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                    <Info size={12} />
                    <span>네이버 스크래핑 IP 차단 우회(시뮬레이션 작동)</span>
                  </span>
                )}
                <span className="badge-demo" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border-color)' }}>
                  <Database size={12} />
                  <span>매물 ID: {report.listing_details.article_no}</span>
                </span>
              </div>
            </div>
          </div>

          {/* ========== TAB NAVIGATION ========== */}
          <div className="tab-nav">
            <button 
              className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
              onClick={() => setActiveTab('comparison')}
            >
              <Scale size={16} />
              항목별 상세 비교
            </button>
            <button 
              className={`tab-btn ${activeTab === 'mismatches' ? 'active' : ''}`}
              onClick={() => setActiveTab('mismatches')}
            >
              <AlertTriangle size={16} />
              불일치 감지 ({report.analysis_report.mismatches.length}건)
            </button>
            <button 
              className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setActiveTab('ledger')}
            >
              <FileText size={16} />
              건축물대장 원본
            </button>
          </div>

          {/* ========== TAB: COMPARISON TABLE ========== */}
          {activeTab === 'comparison' && (
            <div className="glass-panel comparison-table-card">
              {/* Header with PDF button */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Eye size={20} className="logo-icon" />
                    네이버 매물 vs 건축물대장 — 항목별 대조 결과
                  </h3>
                  <p className="comp-table-desc">
                    네이버 부동산에 등록된 값과 정부 건축물대장 공식 데이터를 항목별로 비교합니다.&nbsp;
                    <span className="match-legend safe">● 일치</span>&nbsp;
                    <span className="match-legend danger">● 불일치</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    const rawData = report.ledger_details?.all_raw_data || {};
                    const addr = report.listing_details?.address || '';
                    generateLedgerPdf(rawData, addr);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1.1rem', borderRadius: '8px',
                    background: 'var(--primary-glow)', border: '1px solid var(--primary)',
                    color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem',
                    fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary-glow)'; e.currentTarget.style.color = 'var(--primary)'; }}
                >
                  <Download size={14} />
                  건축물대장 PDF 발급
                </button>
              </div>

              {(() => {
                const allRows = buildComparisonRows();
                const SECTION_ORDER = ['기본 정보', '건축물 정보', '중개사', '중개 보수', '세금', '주변 대중교통'];
                const grouped = {};
                SECTION_ORDER.forEach(s => { grouped[s] = []; });
                allRows.forEach(row => {
                  const sec = row.section || '기본 정보';
                  if (!grouped[sec]) grouped[sec] = [];
                  grouped[sec].push(row);
                });

                const sectionIcons = {
                  '기본 정보': <Home size={15} />,
                  '건축물 정보': <Building2 size={15} />,
                  '중개사': <User size={15} />,
                  '중개 보수': <Wallet size={15} />,
                  '세금': <FileText size={15} />,
                  '주변 대중교통': <Bus size={15} />,
                };

                const colGrid = { display: 'grid', gridTemplateColumns: '150px 1fr 30px 1fr 86px', alignItems: 'center', gap: '0.5rem' };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                    {/* Column header */}
                    <div style={{ ...colGrid, padding: '0 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.6rem' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>검증 항목</div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3B82F6', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block' }} />
                        네이버 부동산
                      </div>
                      <div />
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        건축물대장 공식값
                      </div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>판정</div>
                    </div>

                    {SECTION_ORDER.map(sectionName => {
                      const sRows = grouped[sectionName] || [];
                      if (sRows.length === 0) return null;
                      return (
                        <div key={sectionName}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.45rem 1rem', marginBottom: '0.5rem',
                            background: 'rgba(16, 185, 129, 0.06)',
                            borderLeft: '3px solid var(--primary)',
                            borderRadius: '0 6px 6px 0'
                          }}>
                            <span style={{ color: 'var(--primary)' }}>{sectionIcons[sectionName]}</span>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>{sectionName}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sRows.length}개 항목</span>
                          </div>

                          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
                            {sRows.map((row, idx) => (
                              <div key={idx}
                                style={{
                                  ...colGrid,
                                  padding: '0.75rem 1rem',
                                  borderBottom: idx < sRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                  background: row.highlight ? 'rgba(239,68,68,0.05)' : (idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent'),
                                }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                                  <span style={{ color: 'var(--primary)', opacity: 0.65, marginTop: '1px', flexShrink: 0 }}>{row.icon}</span>
                                  <div>
                                    <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-main)' }}>{row.label}</div>
                                    {row.diff && <div style={{ fontSize: '0.68rem', marginTop: '2px', color: row.match ? 'var(--text-muted)' : 'var(--danger)' }}>{row.diff}</div>}
                                  </div>
                                </div>
                                <div style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>{row.naverVal}</div>
                                <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.25 }}><ArrowRight size={12} /></div>
                                <div style={{ fontSize: '0.86rem', color: row.officialVal === '-' ? 'var(--text-muted)' : 'var(--text-main)' }}>{row.officialVal}</div>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  {row.category === 'check' ? (
                                    row.match
                                      ? <span className="status-badge safe"><CheckCircle2 size={12} />일치</span>
                                      : <span className="status-badge danger"><AlertTriangle size={12} />불일치</span>
                                  ) : (
                                    <span className="status-badge info"><Info size={12} />참고</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {report.listing_details.description && (
                <div className="desc-box" style={{ marginTop: '1.5rem' }}>
                  <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-main)' }}>중개인 매물 설명:</strong>
                  {report.listing_details.description}
                </div>
              )}
            </div>
          )}

          {/* ========== TAB: MISMATCHES ========== */}
          {activeTab === 'mismatches' && (
            <>
              {report.analysis_report.mismatches.length > 0 ? (
                <div className="glass-panel mismatches-card">
                  <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert color="var(--danger)" />
                    감지된 불일치 정합성 위반 항목 ({report.analysis_report.mismatches.length}건)
                  </h3>
                  
                  <div className="mismatch-list">
                    {report.analysis_report.mismatches.map((item, index) => (
                      <div key={index} className={`mismatch-item ${item.severity}`}>
                        <div className="mismatch-icon">
                          <AlertTriangle size={20} />
                        </div>
                        <div className="mismatch-content">
                          <h4 className="mismatch-title">{item.title}</h4>
                          <p className="mismatch-text">{item.message}</p>
                          
                          <div className="mismatch-values">
                            <div className="val-box">
                              <span className="val-lbl">네이버 매물 등록값</span>
                              <span className="val-txt naver">{item.naver_value}</span>
                            </div>
                            <div className="val-box">
                              <span className="val-lbl">정부 건축물대장 공식값</span>
                              <span className="val-txt official">{item.official_value}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                  <CheckCircle2 size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                  <h3 style={{ marginBottom: '0.5rem', color: 'var(--primary)' }}>모든 항목 정합성 일치</h3>
                  <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    네이버 부동산 등록 정보와 건축물대장 공식 데이터 간에 불일치 항목이 감지되지 않았습니다.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ========== TAB: RAW LEDGER DATA ========== */}
          {activeTab === 'ledger' && (
            <div className="glass-panel ledger-raw-card">
              <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={20} className="logo-icon" />
                  건축물대장 공공데이터 연동 원본 데이터 (10개 상세 조회)
                </span>
                <button
                  onClick={() => {
                    const rawData = report.ledger_details?.all_raw_data || {};
                    const addr = report.listing_details?.address || '';
                    generateLedgerPdf(rawData, addr);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.5rem 1rem', borderRadius: '8px',
                    background: 'var(--primary-glow)', border: '1px solid var(--primary)',
                    color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem',
                    fontWeight: 600, whiteSpace: 'nowrap',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary-glow)'; e.currentTarget.style.color = 'var(--primary)'; }}
                >
                  <Download size={14} />
                  건축물대장 PDF 발급
                </button>
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                전국 건축행정시스템(세움터)에서 조회한 해당 주소지의 공식 건축물대장 10종 원본 데이터입니다.
                {report.analysis_report.demo_mode && <span style={{ color: 'var(--warning)' }}> (데모 시뮬레이션 데이터)</span>}
              </p>

              {(() => {
                const translationMap = {
                  'bjdongCd': '법정동코드',
                  'bldNm': '건물명',
                  'block': '블록',
                  'bun': '번',
                  'bylotCnt': '외필지수',
                  'crtnDay': '생성일자',
                  'guyukCd': '구역코드',
                  'guyukCdNm': '구역코드명',
                  'ji': '지',
                  'jiguCd': '지구코드',
                  'jiguCdNm': '지구코드명',
                  'jiyukCd': '지역코드',
                  'jiyukCdNm': '지역코드명',
                  'lot': '로트',
                  'mgmBldrgstPk': '관리건축물대장PK',
                  'mgmUpBldrgstPk': '관리상위건축물대장PK',
                  'naBjdongCd': '새주소법정동코드',
                  'naMainBun': '새주소본번',
                  'naRoadCd': '새주소도로코드',
                  'naSubBun': '새주소부번',
                  'naUgrndCd': '새주소지상지하코드',
                  'newPlatPlc': '도로명대지위치',
                  'platGbCd': '대지구분코드',
                  'platPlc': '대지위치',
                  'regstrGbCd': '대장구분코드',
                  'regstrGbCdNm': '대장구분코드명',
                  'regstrKindCd': '대장종류코드',
                  'regstrKindCdNm': '대장종류코드명',
                  'rnum': '순번',
                  'sigunguCd': '시군구코드',
                  'splotNm': '특수지명',
                  'archArea': '건축면적',
                  'atchBldArea': '부속건축물면적',
                  'atchBldCnt': '부속건축물수',
                  'bcRat': '건폐율',
                  'engrEpi': 'EPI점수',
                  'engrGrade': '에너지효율등급',
                  'engrRat': '에너지절감율',
                  'etcPurps': '기타용도',
                  'fmlyCnt': '가구수',
                  'gnBldCert': '친환경건축물인증점수',
                  'gnBldGrade': '친환경건축물등급',
                  'hhldCnt': '세대수',
                  'hoCnt': '호수',
                  'indrAutoArea': '옥내자주식면적',
                  'indrAutoUtcnt': '옥내자주식대수',
                  'indrMechArea': '옥내기계식면적',
                  'indrMechUtcnt': '옥내기계식대수',
                  'itgBldCert': '지능형건축물인증점수',
                  'itgBldGrade': '지능형건축물등급',
                  'mainBldCnt': '주건축물수',
                  'mainPurpsCd': '주용도코드',
                  'mainPurpsCdNm': '주용도코드명',
                  'newOldRegstrGbCd': '신구대장구분코드',
                  'newOldRegstrGbCdNm': '신구대장구분코드명',
                  'oudrAutoArea': '옥외자주식면적',
                  'oudrAutoUtcnt': '옥외자주식대수',
                  'oudrMechArea': '옥외기계식면적',
                  'oudrMechUtcnt': '옥외기계식대수',
                  'platArea': '대지면적',
                  'pmsDay': '허가일',
                  'pmsnoGbCd': '허가번호구분코드',
                  'pmsnoGbCdNm': '허가번호구분코드명',
                  'pmsnoKikCd': '허가번호기관코드',
                  'pmsnoKikCdNm': '허가번호기관코드명',
                  'pmsnoYear': '허가번호년',
                  'stcnsDay': '착공일',
                  'totArea': '연면적',
                  'totPkngCnt': '총주차수',
                  'useAprDay': '사용승인일',
                  'vlRat': '용적률',
                  'vlRatEstmTotArea': '용적률산정연면적',
                  'dongNm': '동명칭',
                  'emgenUseElvtCnt': '비상용승강기수',
                  'etcRoof': '기타지붕',
                  'etcStrct': '기타구조',
                  'grndFlrCnt': '지상층수',
                  'heit': '높이',
                  'mainAtchGbCd': '주부속구분코드',
                  'mainAtchGbCdNm': '주부속구분코드명',
                  'rideUseElvtCnt': '승용승강기수',
                  'roofCd': '지붕코드',
                  'roofCdNm': '지붕코드명',
                  'rserthqkAblty': '내진 능력',
                  'rserthqkDsgnApplyYn': '내진 설계 적용 여부',
                  'strctCd': '구조코드',
                  'strctCdNm': '구조코드명',
                  'totDongTotArea': '총동연면적',
                  'ugrndFlrCnt': '지하층수',
                  'area': '면적',
                  'areaExctYn': '면적제외여부',
                  'flrGbCd': '층구분코드',
                  'flrGbCdNm': '층구분코드명',
                  'flrNo': '층번호',
                  'flrNoNm': '층번호명',
                  'atchBjdongCd': '부속법정동코드',
                  'atchBlock': '부속블록',
                  'atchBun': '부속번',
                  'atchEtcJibunNm': '부속기타지번명',
                  'atchJi': '부속지',
                  'atchLot': '부속로트',
                  'atchPlatGbCd': '부속대지구분코드',
                  'atchRegstrGbCd': '부속대장구분코드',
                  'atchRegstrGbCdNm': '부속대장구분코드명',
                  'atchSigunguCd': '부속시군구코드',
                  'atchSplotNm': '부속특수지명',
                  'exposPubuseGbCd': '전유공용구분코드',
                  'exposPubuseGbCdNm': '전유공용구분코드명',
                  'hoNm': '호명칭',
                  'capaLube': '용량(루베)',
                  'capaPsper': '용량(인용)',
                  'etcMode': '기타형식',
                  'modeCd': '형식코드',
                  'modeCdNm': '형식코드명',
                  'unitGbCd': '단위구분코드',
                  'unitGbCdNm': '단위구분코드명',
                  'hsprc': '주택가격',
                  'etcJijigu': '기타지역지구구역',
                  'jijiguCd': '지역지구구역코드',
                  'jijiguCdNm': '지역지구구역코드명',
                  'jijiguGbCd': '지역지구구역구분코드',
                  'jijiguGbCdNm': '지역지구구역구분코드명',
                  'reprYn': '대표여부'
                };

                const translateKey = (k) => translationMap[k] || k;

                const sections = [
                  { key: 'title', label: '1. 건축HUB_건축물대장 표제부 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 표제부의 지번주소 및 새주소, 주/부속구분, 대지면적, 건축면적, 건폐율, 용적율, 구조, 용도, 지붕구조, 주차대수 등의 정보를 제공한다.' },
                  { key: 'basis', label: '2. 건축HUB_건축물대장 기본개요 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장의 대장종류, 대장구분, 지번주소 및 새주소, 지역/지구/구역 등의 기본정보를 제공한다.' },
                  { key: 'floor', label: '3. 건축HUB_건축물대장 층별개요 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장의 층구분, 층번호, 층의 구조, 용도, 면적 등의 층별 정보를 제공한다.' },
                  { key: 'expos_pubuse', label: '4. 건축HUB_건축물대장 전유공용면적 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 전유/공용면적의 층구분, 층번호, 전유/공용구분, 구조, 용도 등의 정보를 제공한다.' },
                  { key: 'hs_price', label: '5. 건축HUB_건축물대장 주택가격 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 대상 주택의 가격정보를 제공한다.' },
                  { key: 'expos', label: '6. 건축HUB_건축물대장 전유부 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 전유부의 지번주소 및 새주소, 동/호명칭 등의 정보를 제공한다.' },
                  { key: 'wclf', label: '7. 건축HUB_건축물대장 오수정화시설 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 오수정화시설의 오수정화형식, 용량, 용량단위 등의 정보를 제공한다.' },
                  { key: 'recap', label: '8. 건축HUB_건축물대장 총괄표제부 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 총괄표제부의 지번주소 및 새주소, 대지면적, 건축면적, 연면적, 건폐율, 용적율, 용도, 주차방식 및 주차대수, 부속건축물의 면적, 허가관리기관, 에너지관련 등급 등의 정보를 제공한다.' },
                  { key: 'atch_jibun', label: '9. 건축HUB_건축물대장 부속지번 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 부속지번의 지번주소 및 새주소, 부속대장구분 등의 정보를 제공한다.' },
                  { key: 'jijigu', label: '10. 건축HUB_건축물대장 지역지구구역 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 지역/지구/구역의 구분 및 명칭, 대표여부 등의 정보를 제공한다.' }
                ];

                const allData = report.ledger_details?.all_raw_data || {};

                return sections.map((sec) => {
                  const list = allData[sec.key] || [];
                  return (
                    <div className="ledger-section" key={sec.key} style={{ marginTop: '1.5rem' }}>
                      <h4 className="ledger-section-title">
                        <FileText size={16} />
                        {sec.label}
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', marginTop: '-0.5rem' }}>
                        {sec.desc}
                      </p>
                      {list.length > 0 ? (
                        list.map((item, idx) => (
                          <div key={idx} className="ledger-data-grid" style={{ marginBottom: idx < list.length - 1 ? '1rem' : 0, paddingBottom: idx < list.length - 1 ? '1rem' : 0, borderBottom: idx < list.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none' }}>
                            {Object.entries(item).map(([key, value]) => {
                              if (key === 'rnum' || value === null || String(value).trim() === '') return null;
                              return (
                                <div key={key} className="ledger-data-row">
                                  <span className="ledger-key">{translateKey(key)}</span>
                                  <span className="ledger-val" title={String(value)}>{String(value)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', paddingLeft: '0.5rem' }}>
                          해당 항목의 조회 데이터가 존재하지 않습니다.
                        </p>
                      )}
                    </div>
                  );
                });
              })()}

              {/* Address info */}
              {report.ledger_details?.parsed_address && (
                <div className="ledger-section" style={{ marginTop: '1.5rem' }}>
                  <h4 className="ledger-section-title">
                    <MapPin size={16} />
                    파싱된 주소 정보
                  </h4>
                  <div className="ledger-data-grid">
                    {Object.entries(report.ledger_details.parsed_address).map(([key, value]) => (
                      <div key={key} className="ledger-data-row">
                        <span className="ledger-key">{key}</span>
                        <span className="ledger-val">{String(value)}</span>
                      </div>
                    ))}
                    {report.ledger_details.sigungu_code && (
                      <div className="ledger-data-row">
                        <span className="ledger-key">시군구코드</span>
                        <span className="ledger-val">{report.ledger_details.sigungu_code}</span>
                      </div>
                    )}
                    {report.ledger_details.bdong_code && (
                      <div className="ledger-data-row">
                        <span className="ledger-key">법정동코드</span>
                        <span className="ledger-val">{report.ledger_details.bdong_code}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== TAB: RAW LEDGER DATA ========== */}
          {activeTab === 'ledger' && (
            <div className="glass-panel ledger-raw-card">
              <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} className="logo-icon" />
                건축물대장 공공데이터 연동 원본 데이터 (10개 상세 조회)
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                전국 건축행정시스템(세움터)에서 조회한 해당 주소지의 공식 건축물대장 10종 원본 데이터입니다.
                {report.analysis_report.demo_mode && <span style={{ color: 'var(--warning)' }}> (데모 시뮬레이션 데이터)</span>}
              </p>

              {(() => {
                const translationMap = {
                  'bjdongCd': '법정동코드',
                  'bldNm': '건물명',
                  'block': '블록',
                  'bun': '번',
                  'bylotCnt': '외필지수',
                  'crtnDay': '생성일자',
                  'guyukCd': '구역코드',
                  'guyukCdNm': '구역코드명',
                  'ji': '지',
                  'jiguCd': '지구코드',
                  'jiguCdNm': '지구코드명',
                  'jiyukCd': '지역코드',
                  'jiyukCdNm': '지역코드명',
                  'lot': '로트',
                  'mgmBldrgstPk': '관리건축물대장PK',
                  'mgmUpBldrgstPk': '관리상위건축물대장PK',
                  'naBjdongCd': '새주소법정동코드',
                  'naMainBun': '새주소본번',
                  'naRoadCd': '새주소도로코드',
                  'naSubBun': '새주소부번',
                  'naUgrndCd': '새주소지상지하코드',
                  'newPlatPlc': '도로명대지위치',
                  'platGbCd': '대지구분코드',
                  'platPlc': '대지위치',
                  'regstrGbCd': '대장구분코드',
                  'regstrGbCdNm': '대장구분코드명',
                  'regstrKindCd': '대장종류코드',
                  'regstrKindCdNm': '대장종류코드명',
                  'rnum': '순번',
                  'sigunguCd': '시군구코드',
                  'splotNm': '특수지명',
                  'archArea': '건축면적',
                  'atchBldArea': '부속건축물면적',
                  'atchBldCnt': '부속건축물수',
                  'bcRat': '건폐율',
                  'engrEpi': 'EPI점수',
                  'engrGrade': '에너지효율등급',
                  'engrRat': '에너지절감율',
                  'etcPurps': '기타용도',
                  'fmlyCnt': '가구수',
                  'gnBldCert': '친환경건축물인증점수',
                  'gnBldGrade': '친환경건축물등급',
                  'hhldCnt': '세대수',
                  'hoCnt': '호수',
                  'indrAutoArea': '옥내자주식면적',
                  'indrAutoUtcnt': '옥내자주식대수',
                  'indrMechArea': '옥내기계식면적',
                  'indrMechUtcnt': '옥내기계식대수',
                  'itgBldCert': '지능형건축물인증점수',
                  'itgBldGrade': '지능형건축물등급',
                  'mainBldCnt': '주건축물수',
                  'mainPurpsCd': '주용도코드',
                  'mainPurpsCdNm': '주용도코드명',
                  'newOldRegstrGbCd': '신구대장구분코드',
                  'newOldRegstrGbCdNm': '신구대장구분코드명',
                  'oudrAutoArea': '옥외자주식면적',
                  'oudrAutoUtcnt': '옥외자주식대수',
                  'oudrMechArea': '옥외기계식면적',
                  'oudrMechUtcnt': '옥외기계식대수',
                  'platArea': '대지면적',
                  'pmsDay': '허가일',
                  'pmsnoGbCd': '허가번호구분코드',
                  'pmsnoGbCdNm': '허가번호구분코드명',
                  'pmsnoKikCd': '허가번호기관코드',
                  'pmsnoKikCdNm': '허가번호기관코드명',
                  'pmsnoYear': '허가번호년',
                  'stcnsDay': '착공일',
                  'totArea': '연면적',
                  'totPkngCnt': '총주차수',
                  'useAprDay': '사용승인일',
                  'vlRat': '용적률',
                  'vlRatEstmTotArea': '용적률산정연면적',
                  'dongNm': '동명칭',
                  'emgenUseElvtCnt': '비상용승강기수',
                  'etcRoof': '기타지붕',
                  'etcStrct': '기타구조',
                  'grndFlrCnt': '지상층수',
                  'heit': '높이',
                  'mainAtchGbCd': '주부속구분코드',
                  'mainAtchGbCdNm': '주부속구분코드명',
                  'rideUseElvtCnt': '승용승강기수',
                  'roofCd': '지붕코드',
                  'roofCdNm': '지붕코드명',
                  'rserthqkAblty': '내진 능력',
                  'rserthqkDsgnApplyYn': '내진 설계 적용 여부',
                  'strctCd': '구조코드',
                  'strctCdNm': '구조코드명',
                  'totDongTotArea': '총동연면적',
                  'ugrndFlrCnt': '지하층수',
                  'area': '면적',
                  'areaExctYn': '면적제외여부',
                  'flrGbCd': '층구분코드',
                  'flrGbCdNm': '층구분코드명',
                  'flrNo': '층번호',
                  'flrNoNm': '층번호명',
                  'atchBjdongCd': '부속법정동코드',
                  'atchBlock': '부속블록',
                  'atchBun': '부속번',
                  'atchEtcJibunNm': '부속기타지번명',
                  'atchJi': '부속지',
                  'atchLot': '부속로트',
                  'atchPlatGbCd': '부속대지구분코드',
                  'atchRegstrGbCd': '부속대장구분코드',
                  'atchRegstrGbCdNm': '부속대장구분코드명',
                  'atchSigunguCd': '부속시군구코드',
                  'atchSplotNm': '부속특수지명',
                  'exposPubuseGbCd': '전유공용구분코드',
                  'exposPubuseGbCdNm': '전유공용구분코드명',
                  'hoNm': '호명칭',
                  'capaLube': '용량(루베)',
                  'capaPsper': '용량(인용)',
                  'etcMode': '기타형식',
                  'modeCd': '형식코드',
                  'modeCdNm': '형식코드명',
                  'unitGbCd': '단위구분코드',
                  'unitGbCdNm': '단위구분코드명',
                  'hsprc': '주택가격',
                  'etcJijigu': '기타지역지구구역',
                  'jijiguCd': '지역지구구역코드',
                  'jijiguCdNm': '지역지구구역코드명',
                  'jijiguGbCd': '지역지구구역구분코드',
                  'jijiguGbCdNm': '지역지구구역구분코드명',
                  'reprYn': '대표여부'
                };

                const translateKey = (k) => translationMap[k] || k;

                const sections = [
                  { key: 'title', label: '1. 건축HUB_건축물대장 표제부 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 표제부의 지번주소 및 새주소, 주/부속구분, 대지면적, 건축면적, 건폐율, 용적율, 구조, 용도, 지붕구조, 주차대수 등의 정보를 제공한다.' },
                  { key: 'basis', label: '2. 건축HUB_건축물대장 기본개요 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장의 대장종류, 대장구분, 지번주소 및 새주소, 지역/지구/구역 등의 기본정보를 제공한다.' },
                  { key: 'floor', label: '3. 건축HUB_건축물대장 층별개요 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장의 층구분, 층번호, 층의 구조, 용도, 면적 등의 층별 정보를 제공한다.' },
                  { key: 'expos_pubuse', label: '4. 건축HUB_건축물대장 전유공용면적 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 전유/공용면적의 층구분, 층번호, 전유/공용구분, 구조, 용도 등의 정보를 제공한다.' },
                  { key: 'hs_price', label: '5. 건축HUB_건축물대장 주택가격 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 대상 주택의 가격정보를 제공한다.' },
                  { key: 'expos', label: '6. 건축HUB_건축물대장 전유부 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 전유부의 지번주소 및 새주소, 동/호명칭 등의 정보를 제공한다.' },
                  { key: 'wclf', label: '7. 건축HUB_건축물대장 오수정화시설 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 오수정화시설의 오수정화형식, 용량, 용량단위 등의 정보를 제공한다.' },
                  { key: 'recap', label: '8. 건축HUB_건축물대장 총괄표제부 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장 총괄표제부의 지번주소 및 새주소, 대지면적, 건축면적, 연면적, 건폐율, 용적율, 용도, 주차방식 및 주차대수, 부속건축물의 면적, 허가관리기관, 에너지관련 등급 등의 정보를 제공한다.' },
                  { key: 'atch_jibun', label: '9. 건축HUB_건축물대장 부속지번 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 부속지번의 지번주소 및 새주소, 부속대장구분 등의 정보를 제공한다.' },
                  { key: 'jijigu', label: '10. 건축HUB_건축물대장 지역지구구역 조회', desc: '전국 자치단체의 건축행정정보시스템(세움터)를 통해 생성된 건축물대장과 관련된 지역/지구/구역의 구분 및 명칭, 대표여부 등의 정보를 제공한다.' }
                ];

                const allData = report.ledger_details?.all_raw_data || {};

                return sections.map((sec) => {
                  const list = allData[sec.key] || [];
                  return (
                    <div className="ledger-section" key={sec.key} style={{ marginTop: '1.5rem' }}>
                      <h4 className="ledger-section-title">
                        <FileText size={16} />
                        {sec.label}
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', marginTop: '-0.5rem' }}>
                        {sec.desc}
                      </p>
                      {list.length > 0 ? (
                        list.map((item, idx) => (
                          <div key={idx} className="ledger-data-grid" style={{ marginBottom: idx < list.length - 1 ? '1rem' : 0, paddingBottom: idx < list.length - 1 ? '1rem' : 0, borderBottom: idx < list.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none' }}>
                            {Object.entries(item).map(([key, value]) => {
                              if (key === 'rnum' || value === null || String(value).trim() === '') return null;
                              return (
                                <div key={key} className="ledger-data-row">
                                  <span className="ledger-key">{translateKey(key)}</span>
                                  <span className="ledger-val" title={String(value)}>{String(value)}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', paddingLeft: '0.5rem' }}>
                          해당 항목의 조회 데이터가 존재하지 않습니다.
                        </p>
                      )}
                    </div>
                  );
                });
              })()}

              {/* Address info */}
              {report.ledger_details?.parsed_address && (
                <div className="ledger-section" style={{ marginTop: '1.5rem' }}>
                  <h4 className="ledger-section-title">
                    <MapPin size={16} />
                    파싱된 주소 정보
                  </h4>
                  <div className="ledger-data-grid">
                    {Object.entries(report.ledger_details.parsed_address).map(([key, value]) => (
                      <div key={key} className="ledger-data-row">
                        <span className="ledger-key">{key}</span>
                        <span className="ledger-val">{String(value)}</span>
                      </div>
                    ))}
                    {report.ledger_details.sigungu_code && (
                      <div className="ledger-data-row">
                        <span className="ledger-key">시군구코드</span>
                        <span className="ledger-val">{report.ledger_details.sigungu_code}</span>
                      </div>
                    )}
                    {report.ledger_details.bdong_code && (
                      <div className="ledger-data-row">
                        <span className="ledger-key">법정동코드</span>
                        <span className="ledger-val">{report.ledger_details.bdong_code}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OLD: Comparison Side-by-side (kept for quick glance) */}
          <div className="comparison-grid">
            {/* Left Col: Naver details */}
            <div className="comp-column">
              <h3 className="column-title naver">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }}></span>
                네이버 부동산 등록 요약
              </h3>
              <div className="glass-panel comp-card">
                <h4 className="prop-title">{report.listing_details.title}</h4>
                <div className="detail-list">
                  <div className="detail-row">
                    <span className="detail-label">매물 종류</span>
                    <span className="detail-val">{report.listing_details.property_type} ({report.listing_details.trade_type})</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">등록 가격</span>
                    <span className="detail-val" style={{ fontWeight: 700, color: 'var(--info)' }}>
                      {formatPrice(report.listing_details.price_info, report.listing_details.trade_type)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">해당 층 / 전체 층</span>
                    <span className="detail-val">{report.listing_details.floor_info}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">전용면적</span>
                    <span className="detail-val">{report.listing_details.area_exclusive} ㎡</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">대지면적</span>
                    <span className="detail-val" style={{ fontWeight: 700 }}>
                      {report.listing_details.area_land > 0 ? `${report.listing_details.area_land} ㎡` : '미기재'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">연면적</span>
                    <span className="detail-val">
                      {report.listing_details.area_total > 0 ? `${report.listing_details.area_total} ㎡` : '미기재'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">방/화장실</span>
                    <span className="detail-val">{report.listing_details.room_count}개 / {report.listing_details.bathroom_count}개</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">등록 주소</span>
                    <span className="detail-val" style={{ maxWidth: '220px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={report.listing_details.address}>
                      {report.listing_details.address}
                    </span>
                  </div>
                  {report.listing_details.agent?.brokerage_name && (
                    <div className="detail-row">
                      <span className="detail-label">중개사</span>
                      <span className="detail-val">{report.listing_details.agent.brokerage_name} {report.listing_details.agent.broker_name ? `(${report.listing_details.agent.broker_name})` : ''}</span>
                    </div>
                  )}
                  {report.listing_details.agent_fee?.fee > 0 && (
                    <div className="detail-row">
                      <span className="detail-label">중개 보수</span>
                      <span className="detail-val">최대 {Math.floor(report.listing_details.agent_fee.fee / 10000).toLocaleString()}만원</span>
                    </div>
                  )}
                  {report.listing_details.tax_info?.total > 0 && (
                    <div className="detail-row">
                      <span className="detail-label">취득세 합계</span>
                      <span className="detail-val">약 {Math.floor(report.listing_details.tax_info.total / 10000).toLocaleString()}만원</span>
                    </div>
                  )}
                  {report.listing_details.transport && (report.listing_details.transport.bus || report.listing_details.transport.metro) && (
                    <div className="detail-row">
                      <span className="detail-label">주변 대중교통</span>
                      <span className="detail-val">
                        {[report.listing_details.transport.bus, report.listing_details.transport.metro].filter(t => t && t.trim().length > 0).join(' / ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Col: Government Ledger details */}
            <div className="comp-column">
              <h3 className="column-title official">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
                건축물대장 공부 원본
              </h3>
              <div className="glass-panel comp-card">
                {report.analysis_report.matched_unit ? (
                  <>
                    <h4 className="prop-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 color="var(--primary)" size={20} />
                      매칭 완료: {report.analysis_report.matched_unit.flrNm} {report.analysis_report.matched_unit.hoNm}
                    </h4>
                    <div className="detail-list">
                      <div className="detail-row">
                        <span className="detail-label">공식 용도</span>
                        <span className="detail-val" style={{ color: report.analysis_report.mismatches.some(m => m.category === 'commercial_use') ? 'var(--danger)' : 'inherit', fontWeight: 700 }}>
                          {report.analysis_report.matched_unit.mainPurpsCdNm}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 전용면적</span>
                        <span className="detail-val">{report.analysis_report.matched_unit.exposSpc} ㎡</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 대지면적</span>
                        <span className="detail-val" style={{ fontWeight: 700, color: report.analysis_report.mismatches.some(m => m.category === 'land_area') ? 'var(--danger)' : 'inherit' }}>
                          {report.analysis_report.official_land_area > 0 ? `${report.analysis_report.official_land_area} ㎡` : '미기재'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 연면적</span>
                        <span className="detail-val">
                          {report.analysis_report.official_total_area > 0 ? `${report.analysis_report.official_total_area} ㎡` : '미기재'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 건물구조</span>
                        <span className="detail-val">{report.analysis_report.matched_unit.strctCdNm}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">위반건축물 여부</span>
                        <span className="detail-val" style={{ color: report.analysis_report.mismatches.some(m => m.category === 'violation') ? 'var(--danger)' : 'var(--primary)', fontWeight: 700 }}>
                          {report.analysis_report.mismatches.some(m => m.category === 'violation') ? '위반건축물 지정 (Y)' : '정상 등재 (N)'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">지상/지하 층수</span>
                        <span className="detail-val">{report.analysis_report.matched_unit.flrNm}</span>
                      </div>
                    </div>
                  </>
                ) : getTitleInfo() ? (
                  <>
                    <h4 className="prop-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 color="var(--primary)" size={20} />
                      건물 전체 조회 완료 (일반건축물)
                    </h4>
                    <div className="detail-list">
                      <div className="detail-row">
                        <span className="detail-label">공식 건물명</span>
                        <span className="detail-val">{getTitleInfo().bldNm || '(명칭 없음)'}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 용도</span>
                        <span className="detail-val" style={{ fontWeight: 700 }}>
                          {getTitleInfo().mainPurpsCdNm}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 대지면적</span>
                        <span className="detail-val">{getTitleInfo().platArea > 0 ? `${getTitleInfo().platArea} ㎡` : '미기재'}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 연면적</span>
                        <span className="detail-val" style={{ fontWeight: 700 }}>
                          {getTitleInfo().totArea > 0 ? `${getTitleInfo().totArea} ㎡` : '미기재'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">공식 건물구조</span>
                        <span className="detail-val">{getTitleInfo().strctCdNm}{getTitleInfo().etcStrct ? ` (${getTitleInfo().etcStrct})` : ''}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">위반건축물 여부</span>
                        <span className="detail-val" style={{ color: getTitleInfo().violBldYn === 'Y' ? 'var(--danger)' : 'var(--primary)', fontWeight: 700 }}>
                          {getTitleInfo().violBldYn === 'Y' ? '위반건축물 지정 (Y)' : '정상 등재 (N)'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">지상/지하 층수</span>
                        <span className="detail-val">지상 {getTitleInfo().grndFlrCnt}층 / 지하 {getTitleInfo().ugrndFlrCnt}층</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <AlertTriangle size={36} color="var(--warning)" style={{ marginBottom: '1rem' }} />
                    <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>건축물대장 정보 없음</p>
                    <p style={{ fontSize: '0.8rem', textAlign: 'center', lineHeight: 1.5 }}>
                      제시된 주소지의 건축물대장 정보를 조회하지 못했습니다. 주소가 유효한지 확인해 주십시오.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* History log & Stats Section */}
      <section className="history-section">
        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="glass-panel stat-card">
            <div className="stat-icon-wrapper total">
              <FileText size={20} />
            </div>
            <div>
              <div className="stat-label">누적 검증 횟수</div>
              <div className="stat-value">{stats.total_verified}회</div>
            </div>
          </div>
          <div className="glass-panel stat-card">
            <div className="stat-icon-wrapper danger">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="stat-label">심각 위험(Red)</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.danger_count}건</div>
            </div>
          </div>
          <div className="glass-panel stat-card">
            <div className="stat-icon-wrapper warning">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="stat-label">주의 의심(Orange)</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.warning_count}건</div>
            </div>
          </div>
          <div className="glass-panel stat-card">
            <div className="stat-icon-wrapper safe">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="stat-label">정합 안전(Green)</div>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>{stats.safe_count}건</div>
            </div>
          </div>
        </div>

        {/* Recent logs */}
        {history.length > 0 && (
          <>
            <h3 className="section-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={20} className="logo-icon" />
              최근 정합성 검증 이력 (SQLite 연동)
            </h3>
            <div className="history-grid">
              {history.map((item, index) => (
                <div 
                  key={index} 
                  className="glass-panel history-card"
                  onClick={() => {
                    setInputValue(item.article_no);
                    handleVerify(item.article_no);
                  }}
                >
                  <div className="hist-top">
                    <span className="hist-type">{item.property_type}</span>
                    <span className={`hist-score ${getRiskClass(item.risk_score)}`}>
                      지수: {item.risk_score}
                    </span>
                  </div>
                  <h4 className="hist-title">{item.title}</h4>
                  <p className="hist-addr">{item.address}</p>
                  <span className="hist-date">{new Date(item.created_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default App;
