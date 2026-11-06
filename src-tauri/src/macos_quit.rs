use objc2::{
    ffi,
    runtime::{AnyObject, Imp, Sel},
    sel, MainThreadMarker,
};
use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};
use std::{io, sync::OnceLock};
use tauri::{AppHandle, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();

pub(super) fn install(app: &AppHandle) -> io::Result<()> {
    let main_thread = MainThreadMarker::new()
        .ok_or_else(|| io::Error::other("macOS Quit handler requires the main thread"))?;
    let application = NSApplication::sharedApplication(main_thread);
    let delegate = application
        .delegate()
        .ok_or_else(|| io::Error::other("Missing macOS application delegate"))?;
    let object: &AnyObject = delegate.as_ref();
    let class = object.class();
    let selector = sel!(applicationShouldTerminate:);
    if class.instance_method(selector).is_some() {
        return Err(io::Error::other("macOS Quit handler already exists"));
    }
    APP.set(app.clone())
        .map_err(|_| io::Error::other("macOS Quit handler already installed"))?;

    // Tao handles applicationWillTerminate, which is too late to protect a draft.
    // SAFETY: Add only the missing optional method, with AppKit's 64-bit
    // NSUInteger return value, selector, and NSApplication argument (Q@:@).
    type QuitMethod =
        extern "C-unwind" fn(&AnyObject, Sel, &NSApplication) -> NSApplicationTerminateReply;
    let installed = unsafe {
        ffi::class_addMethod(
            std::ptr::from_ref(class).cast_mut(),
            selector,
            std::mem::transmute::<QuitMethod, Imp>(should_terminate),
            c"Q@:@".as_ptr(),
        )
    };
    if !installed.as_bool() {
        return Err(io::Error::other("Could not install macOS Quit handler"));
    }

    // Let AppKit discover the new optional method on its existing delegate.
    application.setDelegate(None);
    application.setDelegate(Some(&delegate));
    Ok(())
}

extern "C-unwind" fn should_terminate(
    _: &AnyObject,
    _: Sel,
    application: &NSApplication,
) -> NSApplicationTerminateReply {
    let Some(window) = APP.get().and_then(|app| app.get_webview_window("main")) else {
        return NSApplicationTerminateReply::TerminateNow;
    };

    // Dock Quit can arrive with the window out of view. Bring back the editor
    // so the user can respond if its usual close guard shows a confirmation.
    if application.isHidden() {
        application.unhide(None);
    }
    let _ = window.unminimize();
    let _ = window.set_focus();
    if let Err(error) = window.close() {
        eprintln!("Could not request the Envnote window to close: {error}");
    }
    // Closing the last window exits via Tauri. Cancel this independent AppKit
    // request while the same close guard used by the title bar runs.
    NSApplicationTerminateReply::TerminateCancel
}
