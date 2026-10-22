// 엔진 상수. 인스턴스마다 바뀌지 않는 값만 둔다(바뀌는 건물 크기 등은 state.ts의 Ctx에).

/* 그림 자산. 직접 그린 이미지로 바꾸려면 경로를 넣으세요.
   sprite: 64×72 캐릭터 시트, 16×24 칸 4열×3행
     1행 걷기 4장 / 2행 타자 2장, 만세 2장 / 3행 커피, 졸음, 서서 대기, 쪼그려 앉기
   사무실은 자리 수에 따라 크기가 바뀌므로 그림 1장 대신 코드로 그립니다. */
export const ASSETS: { sprite: string | null } = { sprite: null };
export const TAURI_EVENT = 'office-status';     // Tauri 백엔드가 emit 하는 이벤트 이름
export const POLL_MS = 1000, STALE_MS = 5000;
export const CAP_DEFAULT = 3, GROW_AFTER_MS = 60000, MAX_GROUPS = 12, MAX_FLOORS = 8;
export const EMPTY_FLOOR_MS = 5 * 60000;   // 프로젝트 층·팀 섬에 세션이 하나도 없이 5분이 지나면 철거

export const HW = 16, HH = 8, PAD = 14;
export const FW = 16, FH = 24, SPEED = 2.3;
export const HEAD = [21,22,21,22, 20,20,22,24, 20,17,22,15];
export const F_BODY = '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
export const F_DISPLAY = '"Do Hyeon",' + F_BODY;
export const ZONE_COLORS = ['#4f86c6','#d9824a','#5aae7b','#a274c9','#cfa93a','#cf6a7c','#46a3a8','#8a9a5b','#c07a55','#5f7fb0','#b0786a','#6aa08a'];
export const NIGHT = '#0a0e20', NIGHT_A = 0.76;
/* 층: 모든 층의 깊이(NY)를 맞추고 위아래로 띄워 쌓는다.
   층 사이 높이(STOREY)는 아래층 벽 꼭대기와 위층 바닥이 화면에서 겹치지 않는 최소값 = 16·NY + 벽 + 바닥판 + 틈 */
export const WALL = 44, SLAB = 8, FLOOR_GAP = 22;
/* 엘리베이터: 왼쪽 벽 앞쪽(원래 출입문 자리) 바깥에 붙은 승강로. 폭 SHW, 깊이 SHD */
export const SHW = 1.8, SHD = 1.8;
/* 대표실: 맨 위층 안쪽 구석 유리방. 문 앞에서 오른쪽으로 질문 줄이 선다 */
export const CEO = { x0:0, y0:0, x1:4.8, y1:4.4, door0:1.6, door1:3.0 } as const;
export const QX = 2.3, QSTEP = 0.72, QMAX = 12, QY = 5.05, CEO_NX = 12, DEFAULT_PROJECT = '_';
export const WAIT = { x1:11.3, y1:6.4 };   // 대표실 문 앞 질문 대기실 (낮은 벽으로 둘러쌈, 왼쪽 앞이 입구)

export const PXA = 2;
export const CEO_ID = '#ceo';
export const MEET_ROW = 5, PLAN_GAP = 0.9;
export const DESK_PITCH = 1.3;
export const NAV_RES = 0.2;
export const PART_H = 16, PART = { top:'#fffaf1', l:'#efe6d6', r:'#e0d4c0' };
export const OUT = 'out' as const;
export type Out = typeof OUT;
export const CEO_SEAT: [number, number] = [2.4, 1.52];
export const CEO_DOOR: [number, number] = [(CEO.door0 + CEO.door1)/2, CEO.y1];
export const R_AV = 0.6;
export const CAB_SLOTS: [number, number][] = [[-0.62, -0.36], [-0.62, 0.36], [-1.22, -0.36], [-1.22, 0.36]];   // 칸 안 자리 (x, 문 가운데에서 y)
export const APP_LABEL: Record<string, string> = { claude:'Claude', codex:'Codex', gemini:'Gemini' };
