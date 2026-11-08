/**
 * 알프스 워크 · 주간 고객 리포트 → 구글 시트 (Apps Script)
 *
 * 탭 3개가 자동으로 만들어집니다.
 *   주간요약   — 한 주에 한 줄: 발굴 · 통화 · 통화 연결 · 미팅 예약 · 미팅 · 계약 · 무산 · 계약 금액
 *   담당자별   — 한 주 × 팀원 한 줄씩
 *   고객기록   — 그 주에 있었던 발굴·통화·예약·미팅·계약 기록 한 줄씩 (고객·지역·업종·결과·메모·지금 단계)
 * 같은 주를 다시 보내면 그 주 줄을 지우고 새로 씁니다.
 *
 * 설정 순서
 * 1) 구글 시트를 새로 만듭니다 (예: '알프스 주간 고객 리포트').
 * 2) [확장 프로그램] → [Apps Script] 에 이 코드를 통째로 붙여 넣고, 아래 SECRET 을 아무 긴 문자열로 바꿉니다.
 * 3) [배포] → [새 배포] → 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 → 배포 → 권한 허용
 * 4) Vercel(alfs-work) 환경 변수에 넣고 Redeploy:
 *      REPORT_SHEET_URL    = 웹 앱 URL (/exec 로 끝남)
 *      REPORT_SHEET_SECRET = 아래 SECRET 과 같은 값
 * 코드를 고친 뒤에는 [배포] → [배포 관리] → 연필 → 버전: 새 버전 → 배포 (주소는 그대로).
 */
const SECRET = '여기에-아무-긴-문자열을-넣으세요';

const SUMMARY_HEAD = ['주차', '기간', '시작일', '발굴(신규)', '통화', '통화 연결', '미팅 예약', '미팅', '계약', '무산', '계약 금액(원)', '움직인 고객 수', '보낸 시각', '보낸 사람'];
const PEOPLE_HEAD = ['주차', '기간', '이름', '역할', '발굴(신규)', '통화', '통화 연결', '미팅 예약', '미팅', '계약', '무산', '계약 금액(원)'];
const ROWS_HEAD = ['주차', '일시', '구분', '고객', '지역', '업종', '담당자', '결과', '계약 금액(원)', '메모', '지금 단계'];

function doPost(e) {
  const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (d.secret !== SECRET) return out('no');
  if (d.ping) return out('pong');
  const s = d.summary;
  if (!s || !s.week) return out('bad');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sum = tab(ss, '주간요약', SUMMARY_HEAD);
    const ppl = tab(ss, '담당자별', PEOPLE_HEAD);
    const rows = tab(ss, '고객기록', ROWS_HEAD);
    [sum, ppl, rows].forEach(function (sh) { removeWeek(sh, s.week); });

    sum.appendRow([s.week, s.label, s.from, s.scouted, s.calls, s.talked, s.booked, s.met, s.won, s.lost, s.amount, s.customers, new Date(d.sentAt || Date.now()), d.by || '']);
    sortByFirst(sum);

    const pr = (d.people || []).map(function (p) { return [s.week, s.label, p.name, p.role, p.scouted, p.calls, p.talked, p.booked, p.met, p.won, p.lost, p.amount]; });
    if (pr.length) ppl.getRange(ppl.getLastRow() + 1, 1, pr.length, PEOPLE_HEAD.length).setValues(pr);

    const rr = (d.rows || []).map(function (r) { return [s.week, r.at, r.kind, r.lead, r.region, r.category, r.person, r.result, r.amount, r.text, r.stage]; });
    if (rr.length) rows.getRange(rows.getLastRow() + 1, 1, rr.length, ROWS_HEAD.length).setValues(rr);
  } finally { lock.releaseLock(); }
  return out('ok');
}

function out(t) { return ContentService.createTextOutput(t); }

function tab(ss, name, head) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#E8EDF5');
  }
  return sh;
}

// 그 주차 줄을 아래에서부터 지움 (다시 보낼 때 겹치지 않게)
function removeWeek(sh, week) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const vals = sh.getRange(2, 1, n, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === week) sh.deleteRow(i + 2);
}

function sortByFirst(sh) {
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort({ column: 1, ascending: false });
}

// 편집기에서 ▶ 실행으로 확인용 (시트에 '2000-W01' 예시 줄이 생기면 정상 → 지워 주세요)
function 테스트() {
  doPost({ postData: { contents: JSON.stringify({
    secret: SECRET, by: '테스트', sentAt: new Date().toISOString(),
    summary: { week: '2000-W01', label: '테스트 주', from: '2000-01-03', scouted: 3, calls: 10, talked: 6, booked: 2, met: 1, won: 1, lost: 0, amount: 16500000, customers: 5 },
    people: [{ name: '테스트', role: 'TM', scouted: 3, calls: 10, talked: 6, booked: 2, met: 0, won: 0, lost: 0, amount: 0 }],
    rows: [{ at: '2000-01-03 10:00', kind: '통화', lead: '테스트 샵', region: '마포구', category: '카페', person: '테스트', result: '통화 완료', amount: '', text: '테스트 메모', stage: '통화 중' }],
  }) } });
}
