// Не открывать консольное окно рядом с программой в сборке для пользователя.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    html_note_lib::run()
}
