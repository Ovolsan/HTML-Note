use std::fs;
use std::path::PathBuf;
use std::process::Command;

/// Читает документ с диска.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Сохраняет документ: сначала во временный файл рядом, затем подменяет оригинал,
/// чтобы сбой посреди записи не оставил испорченный файл.
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    let tmp = format!("{path}.hn-tmp");
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("{tmp}: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("{path}: {e}")
    })
}

/// Путь к файлу, с которым запустили программу (двойной щелчок или «Открыть с помощью»).
#[tauri::command]
fn initial_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && PathBuf::from(a).is_file())
}

/// Записывает несохранённый документ во временную копию для просмотра в браузере.
#[tauri::command]
fn write_preview(contents: String) -> Result<String, String> {
    let dir = std::env::temp_dir().join("HTML Note");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("Предпросмотр.html");
    fs::write(&path, contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Открывает файл программой по умолчанию (для .html — браузером).
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            initial_file,
            write_preview,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить HTML Note");
}
