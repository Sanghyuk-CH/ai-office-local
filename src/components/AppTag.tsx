// 도구 이름표(Claude, Codex, Gemini). 도구가 두 가지 이상 섞였을 때만 엔진이 채워 준다
export function AppTag({ app }: { app: { key: string; label: string } | null }) {
  if (!app) return null;
  return <span className={`apptag app-${app.key.replace(/[^\w-]/g, '')}`}>{app.label}</span>;
}
