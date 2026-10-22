use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

/// ~/.ai-office
pub fn office_dir() -> PathBuf {
    home().join(".ai-office")
}

/// 사건 기록 폴더. AI_OFFICE_DIR로 바꿀 수 있다(테스트용)
pub fn events_dir() -> PathBuf {
    std::env::var_os("AI_OFFICE_DIR").map(PathBuf::from).unwrap_or_else(|| office_dir().join("events"))
}

/// 훅으로 쓰는 실행 파일 사본. 앱 묶음 안 경로는 빈칸이 있고 다운로드 격리 표시가 붙을 수 있어서
/// 빈칸 없는 곳에 새 파일로 복사해 두고 이것을 훅 명령으로 쓴다
pub fn bin_path() -> PathBuf {
    office_dir().join("bin").join("ai-office")
}

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// 1970-01-01 기준 밀리초 → ISO 8601(UTC). 날짜 라이브러리 없이 계산한다
pub fn iso(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let milli = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (h, m, s) = (sod / 3600, (sod % 3600) / 60, sod % 60);
    // Howard Hinnant의 civil_from_days
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{milli:03}Z")
}

#[cfg(test)]
mod tests {
    #[test]
    fn iso_matches_known_dates() {
        assert_eq!(super::iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(super::iso(1_792_670_604_624), "2026-10-22T12:03:24.624Z");
        assert_eq!(super::iso(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }
}
