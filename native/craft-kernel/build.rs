use std::process::Command;

fn main() {
    let target = std::env::var("TARGET").unwrap_or_else(|_| "unknown-target".to_owned());
    let rustc = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".to_owned());
    let rustc_version = Command::new(rustc)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .unwrap_or_else(|| "unknown-rustc".to_owned());
    println!("cargo:rustc-env=FROZEN_RABBIT_RUST_TARGET={target}");
    println!("cargo:rustc-env=FROZEN_RABBIT_RUSTC_VERSION={rustc_version}");
}
