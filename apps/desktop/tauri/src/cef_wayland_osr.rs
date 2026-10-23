use std::{cell::RefCell, rc::Rc};

use cef::rc::Rc as CefRc;
use cef::{ImplBrowser, ImplBrowserHost, ImplRenderHandler, RenderHandler, WrapRenderHandler};
use gtk::glib::translate::IntoGlib;
use gtk::{gdk, prelude::*};
use tauri_runtime_cef::{cef, Offscreen, OffscreenView};

pub(crate) fn offscreen() -> Offscreen {
    Offscreen::new(|view| {
        let area = gtk::DrawingArea::new();
        area.set_hexpand(true);
        area.set_vexpand(true);
        area.set_focusable(true);

        let frame = Rc::new(RefCell::new(None::<gtk::cairo::ImageSurface>));
        {
            let frame = frame.clone();
            area.set_draw_func(move |_, context, _, _| {
                if let Some(surface) = frame.borrow().as_ref() {
                    let _ = context.set_source_surface(surface, 0.0, 0.0);
                    let _ = context.paint();
                    let _ = context.set_source_rgba(0.0, 0.0, 0.0, 0.0);
                }
            });
        }
        view.gtk_container().append(&area);

        let browser_host = Rc::new(RefCell::new(None));
        attach_pointer_events(&area, browser_host.clone());
        attach_keyboard_events(&area, browser_host.clone());

        cef::wrap_render_handler! {
            struct OsrRenderer {
                view: OffscreenView,
                area: gtk::DrawingArea,
                frame: Rc<RefCell<Option<gtk::cairo::ImageSurface>>>,
                browser_host: Rc<RefCell<Option<cef::BrowserHost>>>,
            }

            impl RenderHandler {
                fn view_rect(&self, _browser: Option<&mut cef::Browser>, rect: Option<&mut cef::Rect>) {
                    let (Some(rect), Some(window)) = (rect, self.view.window()) else {
                        return;
                    };
                    let size = self.view.bounds().size.to_logical::<f64>(window.scale_factor());
                    rect.width = size.width.round() as i32;
                    rect.height = size.height.round() as i32;
                }

                fn on_paint(
                    &self,
                    browser: Option<&mut cef::Browser>,
                    element: cef::PaintElementType,
                    dirty_rects: Option<&[cef::Rect]>,
                    buffer: *const u8,
                    width: i32,
                    height: i32,
                ) {
                    if element != cef::PaintElementType::VIEW || width <= 0 || height <= 0 || buffer.is_null() {
                        return;
                    }

                    if let Some(host) = browser.and_then(|browser| browser.host()) {
                        self.browser_host.replace(Some(host));
                    }

                    // shortcut: CEF still rasterizes in software; use GPU shared-texture import before shipping OSR.
                    let Some(frame_len) = (width as usize)
                        .checked_mul(height as usize)
                        .and_then(|pixels| pixels.checked_mul(4)) else {
                            return;
                        };
                    let source = unsafe { std::slice::from_raw_parts(buffer, frame_len) };
                    let scale = self.view.window().map_or(1.0, |window| window.scale_factor() as f64);
                    let mut frame = self.frame.borrow_mut();
                    let resized = frame.as_ref().is_none_or(|surface| {
                        surface.width() != width || surface.height() != height
                    });
                    if resized {
                        let Ok(surface) = gtk::cairo::ImageSurface::create(
                            gtk::cairo::Format::ARgb32,
                            width,
                            height,
                        ) else {
                            return;
                        };
                        surface.set_device_scale(scale, scale);
                        *frame = Some(surface);
                    }

                    let Some(surface) = frame.as_mut() else { return; };
                    surface.set_device_scale(scale, scale);
                    let stride = surface.stride() as usize;
                    let full_frame = [cef::Rect { x: 0, y: 0, width, height }];
                    let regions = if resized {
                        &full_frame
                    } else {
                        dirty_rects.filter(|rects| !rects.is_empty()).unwrap_or(&full_frame)
                    };
                    let Ok(mut destination) = surface.data() else { return; };
                    for rect in regions {
                        let left = rect.x.max(0).min(width);
                        let top = rect.y.max(0).min(height);
                        let right = rect.x.saturating_add(rect.width).max(0).min(width);
                        let bottom = rect.y.saturating_add(rect.height).max(0).min(height);
                        if right <= left || bottom <= top {
                            continue;
                        }
                        let row_bytes = (right - left) as usize * 4;
                        for y in top..bottom {
                            let src_start = (y as usize * width as usize + left as usize) * 4;
                            let dst_start = y as usize * stride + left as usize * 4;
                            destination[dst_start..dst_start + row_bytes]
                                .copy_from_slice(&source[src_start..src_start + row_bytes]);
                        }
                    }
                    drop(destination);
                    for rect in regions {
                        let left = rect.x.max(0).min(width);
                        let top = rect.y.max(0).min(height);
                        let right = rect.x.saturating_add(rect.width).max(0).min(width);
                        let bottom = rect.y.saturating_add(rect.height).max(0).min(height);
                        if right > left && bottom > top {
                            surface.mark_dirty_rectangle(left, top, right - left, bottom - top);
                        }
                    }
                    self.area.queue_draw();
                }
            }
        }

        OsrRenderer::new(view, area, frame, browser_host)
    })
}

fn attach_pointer_events(
    area: &gtk::DrawingArea,
    browser_host: Rc<RefCell<Option<cef::BrowserHost>>>,
) {
    let position = Rc::new(RefCell::new((0.0, 0.0)));
    let motion = gtk::EventControllerMotion::new();
    {
        let browser_host = browser_host.clone();
        let position = position.clone();
        motion.connect_motion(move |_, x, y| {
            *position.borrow_mut() = (x, y);
            if let Some(host) = browser_host.borrow().as_ref() {
                let event = cef::MouseEvent {
                    x: x as i32,
                    y: y as i32,
                    modifiers: 0,
                };
                host.send_mouse_move_event(Some(&event), 0);
            }
        });
    }
    {
        let browser_host = browser_host.clone();
        motion.connect_leave(move |_| {
            if let Some(host) = browser_host.borrow().as_ref() {
                host.send_mouse_move_event(None, 1);
            }
        });
    }
    area.add_controller(motion);

    let click = gtk::GestureClick::new();
    click.set_button(0);
    {
        let browser_host = browser_host.clone();
        let area = area.clone();
        click.connect_pressed(move |gesture, presses, x, y| {
            let Some(button) = cef_mouse_button(gesture.current_button()) else {
                return;
            };
            area.grab_focus();
            if let Some(host) = browser_host.borrow().as_ref() {
                host.set_focus(1);
                let event = cef::MouseEvent {
                    x: x as i32,
                    y: y as i32,
                    modifiers: 0,
                };
                host.send_mouse_click_event(Some(&event), button, 0, presses);
            }
        });
    }
    {
        let browser_host = browser_host.clone();
        click.connect_released(move |gesture, presses, x, y| {
            let Some(button) = cef_mouse_button(gesture.current_button()) else {
                return;
            };
            if let Some(host) = browser_host.borrow().as_ref() {
                let event = cef::MouseEvent {
                    x: x as i32,
                    y: y as i32,
                    modifiers: 0,
                };
                host.send_mouse_click_event(Some(&event), button, 1, presses);
            }
        });
    }
    area.add_controller(click);

    let scroll = gtk::EventControllerScroll::new(gtk::EventControllerScrollFlags::BOTH_AXES);
    scroll.connect_scroll(move |_, dx, dy| {
        if let Some(host) = browser_host.borrow().as_ref() {
            let (x, y) = *position.borrow();
            let event = cef::MouseEvent {
                x: x as i32,
                y: y as i32,
                modifiers: 0,
            };
            host.send_mouse_wheel_event(Some(&event), (dx * 120.0) as i32, (dy * 120.0) as i32);
        }
        gtk::glib::Propagation::Stop
    });
    area.add_controller(scroll);
}

fn attach_keyboard_events(
    area: &gtk::DrawingArea,
    browser_host: Rc<RefCell<Option<cef::BrowserHost>>>,
) {
    let keys = gtk::EventControllerKey::new();
    {
        let browser_host = browser_host.clone();
        keys.connect_key_pressed(move |_, key, keycode, state| {
            if let Some(host) = browser_host.borrow().as_ref() {
                host.send_key_event(Some(&cef_key_event(
                    cef::KeyEventType::KEYDOWN,
                    key,
                    keycode,
                    state,
                )));
                if let Some(character) = key.to_unicode() {
                    let mut character_event =
                        cef_key_event(cef::KeyEventType::CHAR, key, keycode, state);
                    character_event.character = character as u16;
                    character_event.unmodified_character = character as u16;
                    host.send_key_event(Some(&character_event));
                }
            }
            gtk::glib::Propagation::Stop
        });
    }
    keys.connect_key_released(move |_, key, keycode, state| {
        if let Some(host) = browser_host.borrow().as_ref() {
            host.send_key_event(Some(&cef_key_event(
                cef::KeyEventType::KEYUP,
                key,
                keycode,
                state,
            )));
        }
    });
    area.add_controller(keys);
}

fn cef_mouse_button(button: u32) -> Option<cef::MouseButtonType> {
    match button {
        1 => Some(cef::MouseButtonType::LEFT),
        2 => Some(cef::MouseButtonType::MIDDLE),
        3 => Some(cef::MouseButtonType::RIGHT),
        _ => None,
    }
}

fn cef_key_event(
    type_: cef::KeyEventType,
    key: gdk::Key,
    keycode: u32,
    state: gdk::ModifierType,
) -> cef::KeyEvent {
    let mut modifiers = 0;
    for (mask, flag) in [
        (
            gdk::ModifierType::SHIFT_MASK,
            cef::sys::cef_event_flags_t::EVENTFLAG_SHIFT_DOWN,
        ),
        (
            gdk::ModifierType::CONTROL_MASK,
            cef::sys::cef_event_flags_t::EVENTFLAG_CONTROL_DOWN,
        ),
        (
            gdk::ModifierType::ALT_MASK,
            cef::sys::cef_event_flags_t::EVENTFLAG_ALT_DOWN,
        ),
        (
            gdk::ModifierType::SUPER_MASK,
            cef::sys::cef_event_flags_t::EVENTFLAG_COMMAND_DOWN,
        ),
    ] {
        if state.contains(mask) {
            modifiers |= flag.0;
        }
    }
    cef::KeyEvent {
        size: std::mem::size_of::<cef::sys::cef_key_event_t>(),
        type_,
        modifiers,
        windows_key_code: key.into_glib() as i32,
        native_key_code: keycode as i32,
        is_system_key: 0,
        character: 0,
        unmodified_character: 0,
        focus_on_editable_field: 0,
    }
}
