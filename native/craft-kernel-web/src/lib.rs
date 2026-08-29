//! Narrow WebAssembly boundary for the authoritative Rust craft kernel.
//!
//! Export attributes are isolated in this crate. The owning craft kernel keeps
//! `forbid(unsafe_code)` and this boundary contains no unsafe blocks or pointer
//! dereferences; JavaScript only writes into Rust-owned, size-bounded buffers.

#![deny(unsafe_code)]

use std::cell::RefCell;

use frozen_rabbit_craft_kernel::{
    WEB_PLANNER_ABI_VERSION, WEB_PLANNER_MAX_INPUT_BYTES, WEB_PLANNER_MAX_OUTPUT_BYTES,
    WebPlannerSession, format_web_planner_reply,
};

thread_local! {
    static WEB_INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static WEB_OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static WEB_SESSION: RefCell<WebPlannerSession> = RefCell::new(WebPlannerSession::default());
}

fn sanitized_cell(value: &str) -> String {
    value.replace(['\t', '\r', '\n'], " ")
}

fn format_error(message: &str) -> String {
    [WEB_PLANNER_ABI_VERSION, "error", &sanitized_cell(message)].join("\t")
}

fn store_output(output: String) -> i32 {
    let (status, mut bytes) = if output.len() <= WEB_PLANNER_MAX_OUTPUT_BYTES {
        (0, output.into_bytes())
    } else {
        (
            2,
            format_error("Web planner output exceeded its byte limit").into_bytes(),
        )
    };
    bytes.push(b'\n');
    WEB_OUTPUT.with(|buffer| *buffer.borrow_mut() = bytes);
    status
}

// Rust 2024 treats stable external symbol names as an unsafe attribute because
// duplicate names would be a linker error. Each exception is local, while the
// crate still denies unsafe blocks and every other unscoped unsafe operation.
#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn frozen_rabbit_web_input_resize(length: u32) -> i32 {
    let Ok(length) = usize::try_from(length) else {
        return 1;
    };
    if length == 0 || length > WEB_PLANNER_MAX_INPUT_BYTES {
        return 1;
    }
    WEB_INPUT.with(|buffer| buffer.borrow_mut().resize(length, 0));
    0
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn frozen_rabbit_web_input_ptr() -> u32 {
    WEB_INPUT.with(|buffer| buffer.borrow_mut().as_mut_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn frozen_rabbit_web_recommend() -> i32 {
    let result = WEB_INPUT.with(|buffer| {
        String::from_utf8(buffer.borrow().clone())
            .map_err(|_| "Web planner request must be UTF-8".to_owned())
            .and_then(|request| {
                WEB_SESSION.with(|session| session.borrow_mut().recommend_request(&request))
            })
    });
    match result {
        Ok(reply) => store_output(format_web_planner_reply(&reply)),
        Err(message) => {
            let _ = store_output(format_error(&message));
            1
        }
    }
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn frozen_rabbit_web_output_ptr() -> u32 {
    WEB_OUTPUT.with(|buffer| buffer.borrow().as_ptr() as usize as u32)
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn frozen_rabbit_web_output_len() -> u32 {
    WEB_OUTPUT.with(|buffer| buffer.borrow().len() as u32)
}

#[allow(unsafe_code)]
#[unsafe(no_mangle)]
pub extern "C" fn frozen_rabbit_web_reset_session() {
    WEB_SESSION.with(|session| session.borrow_mut().reset());
}
