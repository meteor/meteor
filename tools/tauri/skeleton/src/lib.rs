// Entry point for the Meteor + Tauri application.
//
// The meteor-webapp plugin serves the Meteor client bundle from disk and
// implements Hot Code Push (downloading new client versions and swapping them
// in), mirroring cordova-plugin-meteor-webapp.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_meteor_webapp::init())
        .run(tauri::generate_context!())
        .expect("error while running Meteor Tauri application");
}
