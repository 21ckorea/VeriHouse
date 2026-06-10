import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ─── helpers ────────────────────────────────────────────────
const arr1 = (v) => Array.isArray(v) ? v[0] || {} : (v || {});
const fv   = (v, suffix = '') =>
  (v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== ' ')
    ? `${v}${suffix}` : '-';
const fd   = (d) => {
  if (!d) return '-';
  const s = String(d).replace(/-/g, '');
  if (s.length === 8) return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
  return s;
};
const fa   = (v) => (v && Number(v) > 0)
  ? `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ㎡` : '-';
const fp   = (v) => (v && Number(v) > 0) ? `${Number(v).toFixed(2)} %` : '-';

// ─── HTML builder ────────────────────────────────────────────
function buildHtml(rawData, address) {
  // Handle both array and object formats from the API
  const t    = arr1(rawData.title);
  const b    = arr1(rawData.basis);
  const wclf = arr1(rawData.wclf);
  const floors     = Array.isArray(rawData.floor)   ? rawData.floor   : (rawData.floor   ? [rawData.floor]   : []);
  const jijiguList = Array.isArray(rawData.jijigu)  ? rawData.jijigu  : (rawData.jijigu  ? [rawData.jijigu]  : []);
  const expos      = Array.isArray(rawData.expos)   ? rawData.expos   : (rawData.expos   ? [rawData.expos]   : []);
  const today      = new Date().toLocaleDateString('ko-KR');

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans KR', 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
      font-size: 11px; color: #1a1a2e; background: #fff;
    }
    .page { width: 780px; padding: 28px 36px; }

    /* header */
    .doc-header {
      background: #19375f; color: #fff; text-align: center;
      padding: 14px 12px 10px; border-radius: 6px; margin-bottom: 16px;
    }
    .doc-header h1 { font-size: 22px; font-weight: 700; letter-spacing: 8px; margin-bottom: 4px; }
    .doc-header p  { font-size: 9.5px; color: rgba(255,255,255,0.75); }
    .meta-row      { display: flex; justify-content: space-between; font-size: 10px; color: #555; margin-bottom: 14px; }

    /* section wrapper — never break inside */
    .sec-wrap {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 0;
    }
    .sec-spacer { height: 14px; }

    /* section label */
    .sec-label {
      background: #ebf0fa; color: #19375f;
      font-size: 11px; font-weight: 700;
      padding: 5px 10px; margin-bottom: 0;
      border-left: 3px solid #19375f;
    }

    /* kv table */
    table { width: 100%; border-collapse: collapse; }
    td    { border: 1px solid #cdd6e4; padding: 5px 8px; font-size: 10.5px; vertical-align: middle; }
    .kh   { background: #ebf0fa; font-weight: 700; color: #19375f; width: 20%; }
    .kv   { background: #fff; width: 30%; }

    /* generic table header */
    .gh   { background: #19375f; color: #fff; font-weight: 700; text-align: center; }
    tr:nth-child(even) td:not(.kh) { background: #f8faff; }
    .total-row td { background: #ebf0fa !important; font-weight: 700; }

    /* footer */
    .footer {
      margin-top: 24px; border-top: 1px solid #cdd6e4;
      padding-top: 10px; font-size: 9px; color: #888; text-align: center;
      line-height: 1.6;
    }
  `;

  const kv = (pairs) => {
    const rows = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const l = pairs[i];
      const r = i + 1 < pairs.length ? pairs[i + 1] : { k: '', v: '' };
      rows.push(`<tr>
        <td class="kh">${l.k}</td><td class="kv">${l.v}</td>
        <td class="kh">${r.k}</td><td class="kv">${r.v}</td>
      </tr>`);
    }
    return `<table>${rows.join('')}</table>`;
  };

  const section = (label, inner) => `
    <div class="sec-wrap">
      <div class="sec-label">■ ${label}</div>
      ${inner}
    </div>
    <div class="sec-spacer"></div>`;

  /* Floor table */
  const totalFloorArea = floors.reduce((s, f) => s + Number(f.area || 0), 0);
  const floorRows = floors.map(f => `<tr>
    <td style="text-align:center">${fv(f.flrGbCdNm)}</td>
    <td style="text-align:center">${fv(f.flrNoNm)}</td>
    <td>${fv(f.strctCdNm)}${f.etcStrct?.trim() ? ' / ' + f.etcStrct.trim() : ''}</td>
    <td>${fv(f.mainPurpsCdNm)}${f.etcPurps?.trim() ? ' (' + f.etcPurps.trim() + ')' : ''}</td>
    <td style="text-align:right">${fa(f.area)}</td>
  </tr>`).join('');

  const floorTable = floors.length > 0 ? `
    <table>
      <thead><tr>
        <td class="gh" style="width:10%">구분</td>
        <td class="gh" style="width:10%">층번호</td>
        <td class="gh" style="width:25%">구조</td>
        <td class="gh" style="width:35%">용도</td>
        <td class="gh" style="width:20%">면적 (㎡)</td>
      </tr></thead>
      <tbody>
        ${floorRows}
        <tr class="total-row">
          <td colspan="4" style="text-align:right; padding-right:10px">합 계</td>
          <td style="text-align:right">${fa(totalFloorArea)}</td>
        </tr>
      </tbody>
    </table>` : '';

  /* jijigu table */
  const jiRows = jijiguList.map(j => `<tr>
    <td>${fv(j.jijiguGbCdNm)}</td>
    <td>${fv(j.jijiguCd)}</td>
    <td>${fv(j.jijiguCdNm)}</td>
    <td>${fv(j.etcJijigu)}</td>
  </tr>`).join('');

  const jiTable = jijiguList.length > 0 ? `
    <table>
      <thead><tr>
        <td class="gh" style="width:22%">구분</td>
        <td class="gh" style="width:14%">코드</td>
        <td class="gh" style="width:30%">명칭</td>
        <td class="gh">기타</td>
      </tr></thead>
      <tbody>${jiRows}</tbody>
    </table>` : '';

  /* expos table */
  const expoRows = expos.map(e => `<tr>
    <td style="text-align:center">${fv(e.flrNm)}</td>
    <td style="text-align:center">${fv(e.hoNm)}</td>
    <td>${fv(e.strctCdNm)}</td>
    <td>${fv(e.mainPurpsCdNm)}</td>
    <td style="text-align:right">${fa(e.exposSpc)}</td>
    <td style="text-align:right">${fa(e.sharingArea)}</td>
  </tr>`).join('');

  const expoTable = expos.length > 0 ? `
    <table>
      <thead><tr>
        <td class="gh">층</td><td class="gh">호수</td>
        <td class="gh">구조</td><td class="gh">용도</td>
        <td class="gh">전용면적(㎡)</td><td class="gh">공용면적(㎡)</td>
      </tr></thead>
      <tbody>${expoRows}</tbody>
    </table>` : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>
<div class="page">

  <!-- 제목 -->
  <div class="doc-header">
    <h1>건 축 물 대 장</h1>
    <p>표제부 · 층별개요 · 지역지구 · 오수정화시설 &nbsp;(공공데이터포털 세움터 기반)</p>
  </div>
  <div class="meta-row">
    <span>[ 일반건축물 ]</span>
    <span>발급일자: ${today}</span>
  </div>

  <!-- 소재지 -->
  ${section('소재지', kv([
    { k: '대지위치 (지번)', v: fv(t.platPlc) },
    { k: '도로명주소',      v: fv(t.newPlatPlc) },
  ]))}

  <!-- 건물 기본 현황 -->
  ${section('건물 기본 현황', kv([
    { k: '대장구분',      v: fv(t.regstrGbCdNm) },
    { k: '대장종류',      v: fv(t.regstrKindCdNm) },
    { k: '건물명',        v: fv(t.bldNm) },
    { k: '주구조',        v: `${fv(t.strctCdNm)}${t.etcStrct?.trim() ? ' / ' + t.etcStrct.trim() : ''}` },
    { k: '주용도',        v: `${fv(t.mainPurpsCdNm)}${t.etcPurps?.trim() ? ' / ' + t.etcPurps.trim() : ''}` },
    { k: '지붕구조',      v: `${fv(t.roofCdNm)}${t.etcRoof?.trim() ? ' / ' + t.etcRoof.trim() : ''}` },
    { k: '위반건축물',    v: t.violBldYn === 'Y' ? '⚠️ 위반건축물' : '해당없음' },
    { k: '내진설계적용',  v: t.rserthqkDsgnApplyYn === '1' ? '적용' : '해당없음' },
  ]))}

  <!-- 면적 현황 -->
  ${section('면적 현황', kv([
    { k: '대지면적',             v: fa(t.platArea) },
    { k: '건축면적',             v: fa(t.archArea) },
    { k: '연면적 (합계)',        v: fa(t.totArea) },
    { k: '용적률 산정 연면적',   v: fa(t.vlRatEstmTotArea) },
    { k: '건폐율',               v: fp(t.bcRat) },
    { k: '용적률',               v: fp(t.vlRat) },
  ]))}

  <!-- 층수·세대·규모 -->
  ${section('층수 · 세대 · 규모', kv([
    { k: '지상층수',       v: fv(t.grndFlrCnt,  '층') },
    { k: '지하층수',       v: fv(t.ugrndFlrCnt, '층') },
    { k: '세대수',         v: fv(t.hhldCnt,     '세대') },
    { k: '가구수',         v: fv(t.fmlyCnt,     '가구') },
    { k: '건물높이',       v: fv(t.heit,        'm') },
    { k: '부속건축물',     v: fv(t.atchBldCnt,  '동') },
    { k: '승용 승강기',    v: fv(t.rideUseElvtCnt,  '대') },
    { k: '비상용 승강기',  v: fv(t.emgenUseElvtCnt, '대') },
  ]))}

  <!-- 주차장 현황 -->
  ${section('주차장 현황', kv([
    { k: '옥외자주식', v: `${fv(t.oudrAutoUtcnt, '대')} / ${fa(t.oudrAutoArea)}` },
    { k: '옥내자주식', v: `${fv(t.indrAutoUtcnt, '대')} / ${fa(t.indrAutoArea)}` },
    { k: '옥외기계식', v: `${fv(t.oudrMechUtcnt, '대')} / ${fa(t.oudrMechArea)}` },
    { k: '옥내기계식', v: `${fv(t.indrMechUtcnt, '대')} / ${fa(t.indrMechArea)}` },
  ]))}

  <!-- 날짜 정보 -->
  ${section('날짜 정보', kv([
    { k: '허가일',      v: fd(t.pmsDay) },
    { k: '착공일',      v: fd(t.stcnsDay) },
    { k: '사용승인일',  v: fd(t.useAprDay) },
    { k: '생성일자',    v: fd(t.crtnDay) },
  ]))}

  <!-- 지역·지구 -->
  ${(b.jiyukCdNm || b.jiguCdNm) ? section('지역 · 지구 · 구역', kv([
    { k: '지역',    v: fv(b.jiyukCdNm) },
    { k: '지구',    v: fv(b.jiguCdNm) },
    { k: '구역',    v: fv(b.guyukCdNm) },
    { k: '대장구분', v: fv(b.regstrGbCdNm) },
  ])) : ''}

  <!-- 층별개요 -->
  ${floors.length > 0 ? section('층별개요', floorTable) : ''}

  <!-- 오수정화시설 -->
  ${wclf.modeCdNm ? section('오수정화시설', kv([
    { k: '처리방식', v: `${fv(wclf.modeCdNm)}${wclf.etcMode?.trim() ? ' / ' + wclf.etcMode.trim() : ''}` },
    { k: '처리용량', v: fv(wclf.capaPsper, '인용') },
  ])) : ''}

  <!-- 지역지구구역 상세 -->
  ${jijiguList.length > 0 ? section('지역지구구역 상세', jiTable) : ''}

  <!-- 전유/공용 -->
  ${expos.length > 0 ? section('전유 / 공용 부분 (집합건물)', expoTable) : ''}

  <div class="footer">
    본 문서는 VeriHouse가 공공데이터포털(국토교통부 세움터)에서 조회한 건축물대장 데이터를 기반으로 생성한 참고용 문서입니다.<br>
    공식 건축물대장 열람은 정부24(gov.kr) 또는 세움터(eais.go.kr)를 이용하시기 바랍니다.
  </div>

</div>
</body>
</html>`;
}

// ─── Smart page splitter ─────────────────────────────────────
/**
 * Split a tall canvas into A4-sized chunks without cutting through content.
 * Strategy: find the largest vertical gap (row of near-white pixels) near the split point.
 */
function findBestSplit(canvas, targetY, searchRange = 60) {
  const ctx = canvas.getContext('2d');
  const w   = canvas.width;
  // Only search BACKWARDS from targetY — never go past it to prevent overflow
  const hi  = Math.min(canvas.height - 1, targetY);
  const lo  = Math.max(0, targetY - searchRange);

  let bestY     = hi;   // fallback: exactly at targetY
  let bestScore = -1;

  for (let y = hi; y >= lo; y--) {
    const data = ctx.getImageData(0, y, w, 1).data;
    let whiteCount = 0;
    for (let x = 0; x < data.length; x += 4) {
      const r = data[x], g = data[x+1], bl = data[x+2];
      if (r > 240 && g > 240 && bl > 240) whiteCount++;
    }
    const score = whiteCount / w;
    if (score > bestScore) {
      bestScore = score;
      bestY     = y;
    }
    if (bestScore > 0.97) break;   // perfect white gap found
  }

  return bestY;
}

// ─── Main export ─────────────────────────────────────────────
export async function generateLedgerPdf(rawData, address) {
  /* 1. Build hidden iframe */
  const iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0',
    'width:780px', 'height:2000px',
    'border:none', 'visibility:hidden', 'overflow:hidden'
  ].join(';');
  document.body.appendChild(iframe);

  iframe.contentDocument.open();
  iframe.contentDocument.write(buildHtml(rawData, address));
  iframe.contentDocument.close();

  /* 2. Wait for Noto Sans KR (Google Fonts) to load */
  await new Promise(r => setTimeout(r, 2000));

  const page = iframe.contentDocument.querySelector('.page');
  const fullH = page.scrollHeight + 40;
  iframe.style.height = `${fullH}px`;
  await new Promise(r => setTimeout(r, 300));

  /* 3. Capture full page at 2× */
  const SCALE = 2;
  const canvas = await html2canvas(page, {
    useCORS:     true,
    scale:       SCALE,
    backgroundColor: '#ffffff',
    width:       780,
    windowWidth: 780,
    scrollY:     0,
    scrollX:     0,
  });

  document.body.removeChild(iframe);

  /* 4. PDF dimensions & margins */
  const A4_W_PX   = canvas.width;   // 780 × SCALE = 1560 px
  const A4_W_MM   = 210;
  const A4_H_MM   = 297;

  const MARGIN_TOP_MM    = 12;
  const MARGIN_BOTTOM_MM = 18;
  const MARGIN_LR_MM     = 10;

  const CONTENT_W_MM  = A4_W_MM - MARGIN_LR_MM * 2;               // 190 mm
  const CONTENT_H_MM  = A4_H_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM; // 267 mm
  const PX_PER_MM     = A4_W_PX / CONTENT_W_MM;
  const CONTENT_H_PX  = Math.floor(CONTENT_H_MM * PX_PER_MM);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  /* 5. Split canvas into page slices using content-area height */
  let currentY  = 0;
  let safetyIdx = 0;
  const pages   = [];

  while (currentY < canvas.height) {
    const remaining = canvas.height - currentY;
    if (remaining <= CONTENT_H_PX) {
      pages.push({ srcY: currentY, srcH: remaining });
      break;
    }
    const splitY = findBestSplit(canvas, currentY + CONTENT_H_PX, 80 * SCALE);
    pages.push({ srcY: currentY, srcH: splitY - currentY });
    currentY = splitY;
    if (++safetyIdx > 20) break;
  }

  /* 6. Render each page slice into its content area */
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const { srcY, srcH } = pages[i];

    // Canvas exactly the size of this slice (no blank padding)
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width  = A4_W_PX;
    sliceCanvas.height = srcH;
    const sCtx = sliceCanvas.getContext('2d');
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(0, 0, A4_W_PX, srcH);
    sCtx.drawImage(canvas, 0, srcY, A4_W_PX, srcH, 0, 0, A4_W_PX, srcH);

    const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);

    // Height in mm while maintaining pixel aspect ratio
    const sliceH_mm = srcH / PX_PER_MM;

    // Place inside content area: (left margin, top margin)
    pdf.addImage(imgData, 'JPEG', MARGIN_LR_MM, MARGIN_TOP_MM, CONTENT_W_MM, sliceH_mm);
  }

  /* 7. Header & footer on every page (ASCII only — jsPDF has no Korean font) */
  const totalPages = pages.length;
  const FOOTER_Y   = A4_H_MM - MARGIN_BOTTOM_MM + 6;  // y position inside bottom margin

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(190, 205, 225);
    pdf.setLineWidth(0.25);

    // ── top rule + label ──
    const TOP_LINE_Y = MARGIN_TOP_MM - 3;
    pdf.line(MARGIN_LR_MM, TOP_LINE_Y, A4_W_MM - MARGIN_LR_MM, TOP_LINE_Y);
    pdf.setFontSize(7);
    pdf.setTextColor(100, 130, 170);
    pdf.text('Building Ledger (eais.go.kr)', MARGIN_LR_MM, TOP_LINE_Y - 1.5);
    pdf.text('VeriHouse', A4_W_MM - MARGIN_LR_MM, TOP_LINE_Y - 1.5, { align: 'right' });

    // ── bottom rule + page number ──
    const BOT_LINE_Y = A4_H_MM - MARGIN_BOTTOM_MM + 3;
    pdf.line(MARGIN_LR_MM, BOT_LINE_Y, A4_W_MM - MARGIN_LR_MM, BOT_LINE_Y);
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`${i} / ${totalPages}`, A4_W_MM / 2, FOOTER_Y, { align: 'center' });
    pdf.setFontSize(6.5);
    pdf.text('Public data portal - for reference only', A4_W_MM - MARGIN_LR_MM, FOOTER_Y, { align: 'right' });
  }

  /* 8. Save */
  const safeAddr = (address || '건축물대장')
    .replace(/[\\/:\*\?"<>|]/g, '_')
    .substring(0, 40);
  const dateStr = new Date()
    .toLocaleDateString('ko-KR')
    .replace(/\.\s*/g, '')
    .trim();
  pdf.save(`건축물대장_${safeAddr}_${dateStr}.pdf`);
}
