//! Raw unsafe FFI bindings to the libminizinc C++ shim.
//!
//! Do NOT use this crate directly from application code.
//! Use the safe `alloy` crate instead.

#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
// Add this to the root of your crate to do a manual migration.
#![allow(missing_unsafe_on_extern)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
