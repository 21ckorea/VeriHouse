import React, { useState } from 'react';
import {
  Search, FileText, Download, Building2, MapPin, Layers,
  Calendar, AlertTriangle, CheckCircle2, ChevronRight,
  Home, RotateCcw, Info, ArrowLeft
} from 'lucide-react';
import { generateLedgerPdf } from './generateLedgerPdf';

const API_BASE = 'http://localhost:8000';

// ── helpers ──────────────────────────────────────────────────
const fv  = (v, suffix = '') =>
  (v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== ' ')
    ? `${v}${suffix}` : '-';
const fd  = (d) => {
  if (!d) return '-';
  const s = String(d).replace(/-/g, '');
  if (s.length === 8) return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
  return s;
};
const fa  = (v) => (v && Number(v) > 0)
  ? `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ㎡` : '-';
const fp  = (v) => (v && Number(v) > 0) ? `${Number(v).toFixed(2)} %` : '-';
const arr1 = (v) => Array.isArray(v) ? v[0] || {} : (v || {});

// ── Sample addresses ──────────────────────────────────────────
const SAMPLE_ADDRESSES = [
  '대구광역시 동구 중대동 422-2',
  '서울특별시 마포구 아현동 123-45',
  '경기도 성남시 분당구 삼평동 629',
];

// ── Loading spinner ───────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid rgba(16,185,129,0.15)',
        borderTopColor: 'var(--primary)',
        animation: 'spin 0.8s linear infinite'
      }} />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>건축물대장 10종 조회 중…</p>
    </div>
  );
}

// ── Info row ─────────────────────────────────────────────────
function InfoRow({ label, value, highlight }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '160px 1fr',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      padding: '0.55rem 1rem',
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{
        fontSize: '0.88rem',
        color: highlight ? 'var(--danger)' : (value === '-' ? 'var(--text-muted)' : 'var(--text-main)')
      }}>{value}</span>
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────
function SectionCard({ icon, title, children }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.6rem 1rem',
        background: 'rgba(16,185,129,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderLeft: '3px solid var(--primary)'
      }}>
        <span style={{ color: 'var(--primary)' }}>{icon}</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function LedgerPage({ onBack }) {
  const [address, setAddress]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [result,  setResult]    = useState(null);
  const [error,   setError]     = useState('');
  const [pdfBusy, setPdfBusy]   = useState(false);

  const handleSearch = async (addr = address) => {
    const q = addr.trim();
    if (!q) { setError('주소를 입력해 주세요.'); return; }
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ledger/by-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '조회 실패');
      if (!data.success) throw new Error('해당 주소에서 건축물대장을 찾을 수 없습니다.');
      setResult(data);
    } catch (e) {
      setError(e.message || '서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handlePdf = async () => {
    if (!result) return;
    setPdfBusy(true);
    try {
      await generateLedgerPdf(result.all_raw_data, result.address);
    } finally {
      setPdfBusy(false);
    }
  };

  // Derived data
  const t    = result ? arr1(result.all_raw_data?.title)  : null;
  const b    = result ? arr1(result.all_raw_data?.basis)  : null;
  const wclf = result ? arr1(result.all_raw_data?.wclf)   : null;
  const floors     = result ? (Array.isArray(result.all_raw_data?.floor)  ? result.all_raw_data.floor  : (result.all_raw_data?.floor  ? [result.all_raw_data.floor]  : [])) : [];
  const jijiguList = result ? (Array.isArray(result.all_raw_data?.jijigu) ? result.all_raw_data.jijigu : (result.all_raw_data?.jijigu ? [result.all_raw_data.jijigu] : [])) : [];
  const expos      = result ? (Array.isArray(result.all_raw_data?.expos)  ? result.all_raw_data.expos  : (result.all_raw_data?.expos  ? [result.all_raw_data.expos]  : [])) : [];
  const totalFloorArea = floors.reduce((s, f) => s + Number(f.area || 0), 0);

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh' }}>
      {/* ── TOP NAV ─────────────────────────────── */}
      <header className="top-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem', height: 64, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={16} /> 메인으로
          </button>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>건축물대장 발급</span>
          </div>
        </div>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>도로명 · 지번 주소로 직접 조회</span>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem' }}>

        {/* ── SEARCH CARD ─────────────────────────── */}
        <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={20} style={{ color: 'var(--primary)' }} />
            건축물대장 주소 조회
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            도로명주소 또는 지번주소를 입력하면 공공데이터포털(세움터) 건축물대장 10종을 조회하고 PDF로 발급합니다.
          </p>

          {/* Search bar */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="ledger-address-input"
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="예) 대구광역시 동구 중대동 422-2  또는  대구 동구 용진길 14-18"
                style={{
                  width: '100%', paddingLeft: '2.5rem', paddingRight: '1rem',
                  height: 48, borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-main)', fontSize: '0.92rem',
                  outline: 'none',
                }}
              />
            </div>
            <button
              id="ledger-search-btn"
              onClick={() => handleSearch()}
              disabled={loading}
              style={{
                padding: '0 1.5rem', height: 48, borderRadius: '10px',
                background: loading ? 'rgba(16,185,129,0.3)' : 'var(--primary)',
                border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}
            >
              <Search size={15} />
              {loading ? '조회 중…' : '조회'}
            </button>
          </div>

          {/* Sample addresses */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>예시:</span>
            {SAMPLE_ADDRESSES.map(a => (
              <button
                key={a}
                onClick={() => { setAddress(a); handleSearch(a); }}
                style={{
                  padding: '0.25rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                {a}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.85rem' }}>
              <AlertTriangle size={15} /> {error}
            </div>
          )}
        </div>

        {/* ── LOADING ─────────────────────────────── */}
        {loading && <div className="glass-panel"><Spinner /></div>}

        {/* ── RESULTS ─────────────────────────────── */}
        {result && t && (
          <>
            {/* Summary header */}
            <div className="glass-panel" style={{ padding: '1.5rem 2rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  {t.violBldYn === 'Y'
                    ? <AlertTriangle size={18} color="var(--danger)" />
                    : <CheckCircle2 size={18} color="var(--primary)" />}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {fv(t.platPlc) !== '-' ? t.platPlc : result.address}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {[
                    { l: '용도', v: fv(t.mainPurpsCdNm) },
                    { l: '구조', v: fv(t.strctCdNm) },
                    { l: '연면적', v: fa(t.totArea) },
                    { l: '사용승인', v: fd(t.useAprDay) },
                    { l: '층수', v: `지상 ${fv(t.grndFlrCnt)}층 / 지하 ${fv(t.ugrndFlrCnt)}층` },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{l}: </span>
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  {t.violBldYn === 'Y' && (
                    <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)' }}>
                      ⚠️ 위반건축물
                    </span>
                  )}
                </div>
              </div>
              <button
                id="ledger-pdf-btn"
                onClick={handlePdf}
                disabled={pdfBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.65rem 1.4rem', borderRadius: '10px',
                  background: pdfBusy ? 'rgba(16,185,129,0.3)' : 'var(--primary)',
                  border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                  cursor: pdfBusy ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
              >
                <Download size={16} />
                {pdfBusy ? 'PDF 생성 중…' : '건축물대장 PDF 발급'}
              </button>
            </div>

            {/* ── 소재지 ── */}
            <SectionCard icon={<MapPin size={15} />} title="소재지">
              <InfoRow label="대지위치 (지번)" value={fv(t.platPlc)} />
              <InfoRow label="도로명주소"      value={fv(t.newPlatPlc)} />
            </SectionCard>

            {/* ── 건물 기본 현황 ── */}
            <SectionCard icon={<Building2 size={15} />} title="건물 기본 현황">
              <InfoRow label="대장구분"     value={fv(t.regstrGbCdNm)} />
              <InfoRow label="대장종류"     value={fv(t.regstrKindCdNm)} />
              <InfoRow label="건물명"       value={fv(t.bldNm)} />
              <InfoRow label="주구조"       value={`${fv(t.strctCdNm)}${t.etcStrct?.trim() ? ' / ' + t.etcStrct.trim() : ''}`} />
              <InfoRow label="주용도"       value={`${fv(t.mainPurpsCdNm)}${t.etcPurps?.trim() ? ' / ' + t.etcPurps.trim() : ''}`} />
              <InfoRow label="지붕구조"     value={`${fv(t.roofCdNm)}${t.etcRoof?.trim() ? ' / ' + t.etcRoof.trim() : ''}`} />
              <InfoRow label="위반건축물"   value={t.violBldYn === 'Y' ? '⚠️ 위반건축물' : '해당없음'} highlight={t.violBldYn === 'Y'} />
              <InfoRow label="내진설계적용" value={t.rserthqkDsgnApplyYn === '1' ? '적용' : '해당없음'} />
            </SectionCard>

            {/* ── 면적 현황 ── */}
            <SectionCard icon={<Layers size={15} />} title="면적 현황">
              <InfoRow label="대지면적"          value={fa(t.platArea)} />
              <InfoRow label="건축면적"          value={fa(t.archArea)} />
              <InfoRow label="연면적 (합계)"     value={fa(t.totArea)} />
              <InfoRow label="용적률산정 연면적" value={fa(t.vlRatEstmTotArea)} />
              <InfoRow label="건폐율"            value={fp(t.bcRat)} />
              <InfoRow label="용적률"            value={fp(t.vlRat)} />
            </SectionCard>

            {/* ── 층수·세대·규모 ── */}
            <SectionCard icon={<Home size={15} />} title="층수 · 세대 · 규모">
              <InfoRow label="지상층수"     value={fv(t.grndFlrCnt,  '층')} />
              <InfoRow label="지하층수"     value={fv(t.ugrndFlrCnt, '층')} />
              <InfoRow label="세대수"       value={fv(t.hhldCnt,     '세대')} />
              <InfoRow label="가구수"       value={fv(t.fmlyCnt,     '가구')} />
              <InfoRow label="건물높이"     value={fv(t.heit,        'm')} />
              <InfoRow label="부속건축물"   value={fv(t.atchBldCnt,  '동')} />
              <InfoRow label="승용 승강기"  value={fv(t.rideUseElvtCnt,  '대')} />
              <InfoRow label="비상용 승강기" value={fv(t.emgenUseElvtCnt, '대')} />
            </SectionCard>

            {/* ── 주차장 ── */}
            <SectionCard icon={<Building2 size={15} />} title="주차장 현황">
              <InfoRow label="옥외자주식" value={`${fv(t.oudrAutoUtcnt,'대')} / ${fa(t.oudrAutoArea)}`} />
              <InfoRow label="옥내자주식" value={`${fv(t.indrAutoUtcnt,'대')} / ${fa(t.indrAutoArea)}`} />
              <InfoRow label="옥외기계식" value={`${fv(t.oudrMechUtcnt,'대')} / ${fa(t.oudrMechArea)}`} />
              <InfoRow label="옥내기계식" value={`${fv(t.indrMechUtcnt,'대')} / ${fa(t.indrMechArea)}`} />
            </SectionCard>

            {/* ── 날짜 ── */}
            <SectionCard icon={<Calendar size={15} />} title="날짜 정보">
              <InfoRow label="허가일"     value={fd(t.pmsDay)} />
              <InfoRow label="착공일"     value={fd(t.stcnsDay)} />
              <InfoRow label="사용승인일" value={fd(t.useAprDay)} />
              <InfoRow label="생성일자"   value={fd(t.crtnDay)} />
            </SectionCard>

            {/* ── 지역·지구 ── */}
            {(b?.jiyukCdNm || b?.jiguCdNm) && (
              <SectionCard icon={<MapPin size={15} />} title="지역 · 지구 · 구역">
                <InfoRow label="지역"    value={fv(b.jiyukCdNm)} />
                <InfoRow label="지구"    value={fv(b.jiguCdNm)} />
                <InfoRow label="구역"    value={fv(b.guyukCdNm)} />
                <InfoRow label="대장구분" value={fv(b.regstrGbCdNm)} />
              </SectionCard>
            )}

            {/* ── 층별개요 ── */}
            {floors.length > 0 && (
              <SectionCard icon={<Layers size={15} />} title="층별개요">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(16,185,129,0.08)' }}>
                        {['구분', '층번호', '구조', '용도', '면적'].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {floors.map((f, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{fv(f.flrGbCdNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)', fontWeight: 600 }}>{fv(f.flrNoNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)' }}>{fv(f.strctCdNm)}{f.etcStrct?.trim() ? ` / ${f.etcStrct.trim()}` : ''}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)' }}>{fv(f.mainPurpsCdNm)}{f.etcPurps?.trim() ? ` (${f.etcPurps.trim()})` : ''}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)', textAlign: 'right' }}>{fa(f.area)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(16,185,129,0.06)', fontWeight: 700 }}>
                        <td colSpan={4} style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>합 계</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--primary)' }}>{fa(totalFloorArea)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* ── 오수정화시설 ── */}
            {wclf?.modeCdNm && (
              <SectionCard icon={<Info size={15} />} title="오수정화시설">
                <InfoRow label="처리방식" value={`${fv(wclf.modeCdNm)}${wclf.etcMode?.trim() ? ' / ' + wclf.etcMode.trim() : ''}`} />
                <InfoRow label="처리용량" value={fv(wclf.capaPsper, '인용')} />
              </SectionCard>
            )}

            {/* ── 지역지구구역 상세 ── */}
            {jijiguList.length > 0 && (
              <SectionCard icon={<MapPin size={15} />} title="지역지구구역 상세">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(16,185,129,0.08)' }}>
                        {['구분', '코드', '명칭', '기타'].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jijiguList.map((j, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{fv(j.jijiguGbCdNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)' }}>{fv(j.jijiguCd)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)', fontWeight: 600 }}>{fv(j.jijiguCdNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{fv(j.etcJijigu)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* ── 전유부 ── */}
            {expos.length > 0 && (
              <SectionCard icon={<Home size={15} />} title="전유 / 공용 부분 (집합건물)">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(16,185,129,0.08)' }}>
                        {['층', '호수', '구조', '용도', '전용면적', '공용면적'].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {expos.map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>{fv(e.flrNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)', fontWeight: 600 }}>{fv(e.hoNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)' }}>{fv(e.strctCdNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)' }}>{fv(e.mainPurpsCdNm)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)', textAlign: 'right' }}>{fa(e.exposSpc)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-main)', textAlign: 'right' }}>{fa(e.sharingArea)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* ── Bottom PDF button ── */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={handlePdf}
                disabled={pdfBusy}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 2rem', borderRadius: '10px',
                  background: pdfBusy ? 'rgba(16,185,129,0.3)' : 'var(--primary)',
                  border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.95rem',
                  cursor: pdfBusy ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                }}
              >
                <Download size={18} />
                {pdfBusy ? 'PDF 생성 중…' : '건축물대장 PDF 발급'}
              </button>
              <button
                onClick={() => { setResult(null); setAddress(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 1.5rem', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                }}
              >
                <RotateCcw size={15} /> 다시 조회
              </button>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1.5rem', lineHeight: 1.6 }}>
              본 조회 결과는 공공데이터포털(국토교통부 세움터)에서 제공하는 건축물대장 데이터 기반의 참고용 문서입니다.<br />
              공식 건축물대장 발급은 정부24(gov.kr) 또는 세움터(eais.go.kr)를 이용하시기 바랍니다.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
