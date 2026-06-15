var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// build/index.js
import { WorkerEntrypoint as re } from "cloudflare:workers";
import q from "./f74fbf291aaa338f3aea71a76a2ca5a2dc09361b-index_bg.wasm";
var r;
var j = null;
function S() {
  return (j === null || j.byteLength === 0) && (j = new Uint8Array(r.memory.buffer)), j;
}
__name(S, "S");
var B = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
B.decode();
function G(e2, t) {
  return B.decode(S().subarray(e2, e2 + t));
}
__name(G, "G");
function g(e2, t) {
  return e2 = e2 >>> 0, G(e2, t);
}
__name(g, "g");
var d = 0;
var F = new TextEncoder();
"encodeInto" in F || (F.encodeInto = function(e2, t) {
  let n = F.encode(e2);
  return t.set(n), { read: e2.length, written: n.length };
});
function R(e2, t, n) {
  if (n === void 0) {
    let c = F.encode(e2), w = t(c.length, 1) >>> 0;
    return S().subarray(w, w + c.length).set(c), d = c.length, w;
  }
  let i = e2.length, _ = t(i, 1) >>> 0, f = S(), s = 0;
  for (; s < i; s++) {
    let c = e2.charCodeAt(s);
    if (c > 127) break;
    f[_ + s] = c;
  }
  if (s !== i) {
    s !== 0 && (e2 = e2.slice(s)), _ = n(_, i, i = s + e2.length * 3, 1) >>> 0;
    let c = S().subarray(_ + s, _ + i), w = F.encodeInto(e2, c);
    s += w.written, _ = n(_, i, s, 1) >>> 0;
  }
  return d = s, _;
}
__name(R, "R");
var p = null;
function b() {
  return (p === null || p.buffer.detached === true || p.buffer.detached === void 0 && p.buffer !== r.memory.buffer) && (p = new DataView(r.memory.buffer)), p;
}
__name(b, "b");
function a(e2) {
  return e2 == null;
}
__name(a, "a");
function M(e2) {
  let t = typeof e2;
  if (t == "number" || t == "boolean" || e2 == null) return `${e2}`;
  if (t == "string") return `"${e2}"`;
  if (t == "symbol") {
    let _ = e2.description;
    return _ == null ? "Symbol" : `Symbol(${_})`;
  }
  if (t == "function") {
    let _ = e2.name;
    return typeof _ == "string" && _.length > 0 ? `Function(${_})` : "Function";
  }
  if (Array.isArray(e2)) {
    let _ = e2.length, f = "[";
    _ > 0 && (f += M(e2[0]));
    for (let s = 1; s < _; s++) f += ", " + M(e2[s]);
    return f += "]", f;
  }
  let n = /\[object ([^\]]+)\]/.exec(toString.call(e2)), i;
  if (n && n.length > 1) i = n[1];
  else return toString.call(e2);
  if (i == "Object") try {
    return "Object(" + JSON.stringify(e2) + ")";
  } catch {
    return "Object";
  }
  return e2 instanceof Error ? `${e2.name}: ${e2.message}
${e2.stack}` : i;
}
__name(M, "M");
function l(e2) {
  let t = r.__externref_table_alloc();
  return r.__wbindgen_externrefs.set(t, e2), t;
}
__name(l, "l");
function u(e2, t) {
  try {
    return e2.apply(this, t);
  } catch (n) {
    let i = l(n);
    r.__wbindgen_exn_store(i);
  }
}
__name(u, "u");
function T(e2, t) {
  return e2 = e2 >>> 0, S().subarray(e2 / 1, e2 / 1 + t);
}
__name(T, "T");
var C = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
}, "register"), unregister: /* @__PURE__ */ __name(() => {
}, "unregister") } : new FinalizationRegistry((e2) => {
  e2.instance === o && e2.dtor(e2.a, e2.b);
});
function K(e2, t, n, i) {
  let _ = { a: e2, b: t, cnt: 1, dtor: n, instance: o }, f = /* @__PURE__ */ __name((...s) => {
    if (_.instance !== o) throw new Error("Cannot invoke closure from previous WASM instance");
    _.cnt++;
    let c = _.a;
    _.a = 0;
    try {
      return i(c, _.b, ...s);
    } finally {
      _.a = c, f._wbg_cb_unref();
    }
  }, "f");
  return f._wbg_cb_unref = () => {
    --_.cnt === 0 && (_.dtor(_.a, _.b), _.a = 0, C.unregister(_));
  }, C.register(f, _, _), f;
}
__name(K, "K");
function H(e2, t, n) {
  return r.fetch(e2, t, n);
}
__name(H, "H");
function J(e2, t, n) {
  r.wasm_bindgen__convert__closures_____invoke__h921a0a37fb4cfcc0(e2, t, n);
}
__name(J, "J");
function Q(e2, t, n, i) {
  r.wasm_bindgen__convert__closures_____invoke__h5c0f474407af97c9(e2, t, n, i);
}
__name(Q, "Q");
var oe = Object.freeze({ Off: 0, 0: "Off", Lossy: 1, 1: "Lossy", Lossless: 2, 2: "Lossless" });
var se = Object.freeze({ Error: 0, 0: "Error", Follow: 1, 1: "Follow", Manual: 2, 2: "Manual" });
var X = ["bytes"];
var o = 0;
function $() {
  o++, p = null, j = null, typeof numBytesDecoded < "u" && (numBytesDecoded = 0), typeof d < "u" && (d = 0), r = new WebAssembly.Instance(q, N).exports, r.__wbindgen_start();
}
__name($, "$");
var Y = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
}, "register"), unregister: /* @__PURE__ */ __name(() => {
}, "unregister") } : new FinalizationRegistry(({ ptr: e2, instance: t }) => {
  t === o && r.__wbg_intounderlyingbytesource_free(e2 >>> 0, 1);
});
var h = class {
  static {
    __name(this, "h");
  }
  __destroy_into_raw() {
    let t = this.__wbg_ptr;
    return this.__wbg_ptr = 0, Y.unregister(this), t;
  }
  free() {
    let t = this.__destroy_into_raw();
    r.__wbg_intounderlyingbytesource_free(t, 0);
  }
  get autoAllocateChunkSize() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr) >>> 0;
  }
  pull(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.intounderlyingbytesource_pull(this.__wbg_ptr, t);
  }
  start(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.intounderlyingbytesource_start(this.__wbg_ptr, t);
  }
  get type() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = r.intounderlyingbytesource_type(this.__wbg_ptr);
    return X[t];
  }
  cancel() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = this.__destroy_into_raw();
    r.intounderlyingbytesource_cancel(t);
  }
};
Symbol.dispose && (h.prototype[Symbol.dispose] = h.prototype.free);
var Z = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
}, "register"), unregister: /* @__PURE__ */ __name(() => {
}, "unregister") } : new FinalizationRegistry(({ ptr: e2, instance: t }) => {
  t === o && r.__wbg_intounderlyingsink_free(e2 >>> 0, 1);
});
var m = class {
  static {
    __name(this, "m");
  }
  __destroy_into_raw() {
    let t = this.__wbg_ptr;
    return this.__wbg_ptr = 0, Z.unregister(this), t;
  }
  free() {
    let t = this.__destroy_into_raw();
    r.__wbg_intounderlyingsink_free(t, 0);
  }
  abort(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let n = this.__destroy_into_raw();
    return r.intounderlyingsink_abort(n, t);
  }
  close() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = this.__destroy_into_raw();
    return r.intounderlyingsink_close(t);
  }
  write(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.intounderlyingsink_write(this.__wbg_ptr, t);
  }
};
Symbol.dispose && (m.prototype[Symbol.dispose] = m.prototype.free);
var D = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
}, "register"), unregister: /* @__PURE__ */ __name(() => {
}, "unregister") } : new FinalizationRegistry(({ ptr: e2, instance: t }) => {
  t === o && r.__wbg_intounderlyingsource_free(e2 >>> 0, 1);
});
var y = class e {
  static {
    __name(this, "e");
  }
  static __wrap(t) {
    t = t >>> 0;
    let n = Object.create(e.prototype);
    return n.__wbg_ptr = t, n.__wbg_inst = o, D.register(n, { ptr: t, instance: o }, n), n;
  }
  __destroy_into_raw() {
    let t = this.__wbg_ptr;
    return this.__wbg_ptr = 0, D.unregister(this), t;
  }
  free() {
    let t = this.__destroy_into_raw();
    r.__wbg_intounderlyingsource_free(t, 0);
  }
  pull(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.intounderlyingsource_pull(this.__wbg_ptr, t);
  }
  cancel() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = this.__destroy_into_raw();
    r.intounderlyingsource_cancel(t);
  }
};
Symbol.dispose && (y.prototype[Symbol.dispose] = y.prototype.free);
var ee = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
}, "register"), unregister: /* @__PURE__ */ __name(() => {
}, "unregister") } : new FinalizationRegistry(({ ptr: e2, instance: t }) => {
  t === o && r.__wbg_minifyconfig_free(e2 >>> 0, 1);
});
var x = class {
  static {
    __name(this, "x");
  }
  __destroy_into_raw() {
    let t = this.__wbg_ptr;
    return this.__wbg_ptr = 0, ee.unregister(this), t;
  }
  free() {
    let t = this.__destroy_into_raw();
    r.__wbg_minifyconfig_free(t, 0);
  }
  get js() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.__wbg_get_minifyconfig_js(this.__wbg_ptr) !== 0;
  }
  set js(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.__wbg_set_minifyconfig_js(this.__wbg_ptr, t);
  }
  get html() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.__wbg_get_minifyconfig_html(this.__wbg_ptr) !== 0;
  }
  set html(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.__wbg_set_minifyconfig_html(this.__wbg_ptr, t);
  }
  get css() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    return r.__wbg_get_minifyconfig_css(this.__wbg_ptr) !== 0;
  }
  set css(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.__wbg_set_minifyconfig_css(this.__wbg_ptr, t);
  }
};
Symbol.dispose && (x.prototype[Symbol.dispose] = x.prototype.free);
var te = typeof FinalizationRegistry > "u" ? { register: /* @__PURE__ */ __name(() => {
}, "register"), unregister: /* @__PURE__ */ __name(() => {
}, "unregister") } : new FinalizationRegistry(({ ptr: e2, instance: t }) => {
  t === o && r.__wbg_r2range_free(e2 >>> 0, 1);
});
var v = class {
  static {
    __name(this, "v");
  }
  __destroy_into_raw() {
    let t = this.__wbg_ptr;
    return this.__wbg_ptr = 0, te.unregister(this), t;
  }
  free() {
    let t = this.__destroy_into_raw();
    r.__wbg_r2range_free(t, 0);
  }
  get offset() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = r.__wbg_get_r2range_offset(this.__wbg_ptr);
    return t[0] === 0 ? void 0 : t[1];
  }
  set offset(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.__wbg_set_r2range_offset(this.__wbg_ptr, !a(t), a(t) ? 0 : t);
  }
  get length() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = r.__wbg_get_r2range_length(this.__wbg_ptr);
    return t[0] === 0 ? void 0 : t[1];
  }
  set length(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.__wbg_set_r2range_length(this.__wbg_ptr, !a(t), a(t) ? 0 : t);
  }
  get suffix() {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    let t = r.__wbg_get_r2range_suffix(this.__wbg_ptr);
    return t[0] === 0 ? void 0 : t[1];
  }
  set suffix(t) {
    if (this.__wbg_inst !== void 0 && this.__wbg_inst !== o) throw new Error("Invalid stale object from previous Wasm instance");
    r.__wbg_set_r2range_suffix(this.__wbg_ptr, !a(t), a(t) ? 0 : t);
  }
};
Symbol.dispose && (v.prototype[Symbol.dispose] = v.prototype.free);
var N = { __wbindgen_placeholder__: { __wbg_Error_e83987f665cf5504: /* @__PURE__ */ __name(function(e2, t) {
  return Error(g(e2, t));
}, "__wbg_Error_e83987f665cf5504"), __wbg_String_8f0eb39a4a4c2f66: /* @__PURE__ */ __name(function(e2, t) {
  let n = String(t), i = R(n, r.__wbindgen_malloc, r.__wbindgen_realloc), _ = d;
  b().setInt32(e2 + 4, _, true), b().setInt32(e2 + 0, i, true);
}, "__wbg_String_8f0eb39a4a4c2f66"), __wbg___wbindgen_boolean_get_6d5a1ee65bab5f68: /* @__PURE__ */ __name(function(e2) {
  let t = e2, n = typeof t == "boolean" ? t : void 0;
  return a(n) ? 16777215 : n ? 1 : 0;
}, "__wbg___wbindgen_boolean_get_6d5a1ee65bab5f68"), __wbg___wbindgen_debug_string_df47ffb5e35e6763: /* @__PURE__ */ __name(function(e2, t) {
  let n = M(t), i = R(n, r.__wbindgen_malloc, r.__wbindgen_realloc), _ = d;
  b().setInt32(e2 + 4, _, true), b().setInt32(e2 + 0, i, true);
}, "__wbg___wbindgen_debug_string_df47ffb5e35e6763"), __wbg___wbindgen_in_bb933bd9e1b3bc0f: /* @__PURE__ */ __name(function(e2, t) {
  return e2 in t;
}, "__wbg___wbindgen_in_bb933bd9e1b3bc0f"), __wbg___wbindgen_is_function_ee8a6c5833c90377: /* @__PURE__ */ __name(function(e2) {
  return typeof e2 == "function";
}, "__wbg___wbindgen_is_function_ee8a6c5833c90377"), __wbg___wbindgen_is_object_c818261d21f283a4: /* @__PURE__ */ __name(function(e2) {
  let t = e2;
  return typeof t == "object" && t !== null;
}, "__wbg___wbindgen_is_object_c818261d21f283a4"), __wbg___wbindgen_is_undefined_2d472862bd29a478: /* @__PURE__ */ __name(function(e2) {
  return e2 === void 0;
}, "__wbg___wbindgen_is_undefined_2d472862bd29a478"), __wbg___wbindgen_jsval_loose_eq_b664b38a2f582147: /* @__PURE__ */ __name(function(e2, t) {
  return e2 == t;
}, "__wbg___wbindgen_jsval_loose_eq_b664b38a2f582147"), __wbg___wbindgen_number_get_a20bf9b85341449d: /* @__PURE__ */ __name(function(e2, t) {
  let n = t, i = typeof n == "number" ? n : void 0;
  b().setFloat64(e2 + 8, a(i) ? 0 : i, true), b().setInt32(e2 + 0, !a(i), true);
}, "__wbg___wbindgen_number_get_a20bf9b85341449d"), __wbg___wbindgen_string_get_e4f06c90489ad01b: /* @__PURE__ */ __name(function(e2, t) {
  let n = t, i = typeof n == "string" ? n : void 0;
  var _ = a(i) ? 0 : R(i, r.__wbindgen_malloc, r.__wbindgen_realloc), f = d;
  b().setInt32(e2 + 4, f, true), b().setInt32(e2 + 0, _, true);
}, "__wbg___wbindgen_string_get_e4f06c90489ad01b"), __wbg___wbindgen_throw_b855445ff6a94295: /* @__PURE__ */ __name(function(e2, t) {
  throw new Error(g(e2, t));
}, "__wbg___wbindgen_throw_b855445ff6a94295"), __wbg__wbg_cb_unref_2454a539ea5790d9: /* @__PURE__ */ __name(function(e2) {
  e2._wbg_cb_unref();
}, "__wbg__wbg_cb_unref_2454a539ea5790d9"), __wbg_buffer_ccc4520b36d3ccf4: /* @__PURE__ */ __name(function(e2) {
  return e2.buffer;
}, "__wbg_buffer_ccc4520b36d3ccf4"), __wbg_byobRequest_2344e6975f27456e: /* @__PURE__ */ __name(function(e2) {
  let t = e2.byobRequest;
  return a(t) ? 0 : l(t);
}, "__wbg_byobRequest_2344e6975f27456e"), __wbg_byteLength_bcd42e4025299788: /* @__PURE__ */ __name(function(e2) {
  return e2.byteLength;
}, "__wbg_byteLength_bcd42e4025299788"), __wbg_byteOffset_ca3a6cf7944b364b: /* @__PURE__ */ __name(function(e2) {
  return e2.byteOffset;
}, "__wbg_byteOffset_ca3a6cf7944b364b"), __wbg_call_525440f72fbfc0ea: /* @__PURE__ */ __name(function() {
  return u(function(e2, t, n) {
    return e2.call(t, n);
  }, arguments);
}, "__wbg_call_525440f72fbfc0ea"), __wbg_call_e762c39fa8ea36bf: /* @__PURE__ */ __name(function() {
  return u(function(e2, t) {
    return e2.call(t);
  }, arguments);
}, "__wbg_call_e762c39fa8ea36bf"), __wbg_cause_2551549fc39b3b73: /* @__PURE__ */ __name(function(e2) {
  return e2.cause;
}, "__wbg_cause_2551549fc39b3b73"), __wbg_cf_123509d53a2ea003: /* @__PURE__ */ __name(function() {
  return u(function(e2) {
    let t = e2.cf;
    return a(t) ? 0 : l(t);
  }, arguments);
}, "__wbg_cf_123509d53a2ea003"), __wbg_close_5a6caed3231b68cd: /* @__PURE__ */ __name(function() {
  return u(function(e2) {
    e2.close();
  }, arguments);
}, "__wbg_close_5a6caed3231b68cd"), __wbg_close_6956df845478561a: /* @__PURE__ */ __name(function() {
  return u(function(e2) {
    e2.close();
  }, arguments);
}, "__wbg_close_6956df845478561a"), __wbg_constructor_43c608587565cd11: /* @__PURE__ */ __name(function(e2) {
  return e2.constructor;
}, "__wbg_constructor_43c608587565cd11"), __wbg_enqueue_7b18a650aec77898: /* @__PURE__ */ __name(function() {
  return u(function(e2, t) {
    e2.enqueue(t);
  }, arguments);
}, "__wbg_enqueue_7b18a650aec77898"), __wbg_error_a7f8fbb0523dae15: /* @__PURE__ */ __name(function(e2) {
  console.error(e2);
}, "__wbg_error_a7f8fbb0523dae15"), __wbg_get_efcb449f58ec27c2: /* @__PURE__ */ __name(function() {
  return u(function(e2, t) {
    return Reflect.get(e2, t);
  }, arguments);
}, "__wbg_get_efcb449f58ec27c2"), __wbg_get_with_ref_key_1dc361bd10053bfe: /* @__PURE__ */ __name(function(e2, t) {
  return e2[t];
}, "__wbg_get_with_ref_key_1dc361bd10053bfe"), __wbg_headers_7ae6dbb1272f8fc6: /* @__PURE__ */ __name(function(e2) {
  return e2.headers;
}, "__wbg_headers_7ae6dbb1272f8fc6"), __wbg_instanceof_ArrayBuffer_70beb1189ca63b38: /* @__PURE__ */ __name(function(e2) {
  let t;
  try {
    t = e2 instanceof ArrayBuffer;
  } catch {
    t = false;
  }
  return t;
}, "__wbg_instanceof_ArrayBuffer_70beb1189ca63b38"), __wbg_instanceof_Error_a944ec10920129e2: /* @__PURE__ */ __name(function(e2) {
  let t;
  try {
    t = e2 instanceof Error;
  } catch {
    t = false;
  }
  return t;
}, "__wbg_instanceof_Error_a944ec10920129e2"), __wbg_instanceof_Uint8Array_20c8e73002f7af98: /* @__PURE__ */ __name(function(e2) {
  let t;
  try {
    t = e2 instanceof Uint8Array;
  } catch {
    t = false;
  }
  return t;
}, "__wbg_instanceof_Uint8Array_20c8e73002f7af98"), __wbg_json_2a5b6569e1c7a50f: /* @__PURE__ */ __name(function() {
  return u(function(e2) {
    return e2.json();
  }, arguments);
}, "__wbg_json_2a5b6569e1c7a50f"), __wbg_length_69bca3cb64fc8748: /* @__PURE__ */ __name(function(e2) {
  return e2.length;
}, "__wbg_length_69bca3cb64fc8748"), __wbg_method_07a9b3454994db22: /* @__PURE__ */ __name(function(e2, t) {
  let n = t.method, i = R(n, r.__wbindgen_malloc, r.__wbindgen_realloc), _ = d;
  b().setInt32(e2 + 4, _, true), b().setInt32(e2 + 0, i, true);
}, "__wbg_method_07a9b3454994db22"), __wbg_name_5383f8ff646a0ac1: /* @__PURE__ */ __name(function(e2) {
  return e2.name;
}, "__wbg_name_5383f8ff646a0ac1"), __wbg_new_1acc0b6eea89d040: /* @__PURE__ */ __name(function() {
  return new Object();
}, "__wbg_new_1acc0b6eea89d040"), __wbg_new_3c3d849046688a66: /* @__PURE__ */ __name(function(e2, t) {
  try {
    var n = { a: e2, b: t }, i = /* @__PURE__ */ __name((f, s) => {
      let c = n.a;
      n.a = 0;
      try {
        return Q(c, n.b, f, s);
      } finally {
        n.a = c;
      }
    }, "i");
    return new Promise(i);
  } finally {
    n.a = n.b = 0;
  }
}, "__wbg_new_3c3d849046688a66"), __wbg_new_5a79be3ab53b8aa5: /* @__PURE__ */ __name(function(e2) {
  return new Uint8Array(e2);
}, "__wbg_new_5a79be3ab53b8aa5"), __wbg_new_9edf9838a2def39c: /* @__PURE__ */ __name(function() {
  return u(function() {
    return new Headers();
  }, arguments);
}, "__wbg_new_9edf9838a2def39c"), __wbg_new_a7442b4b19c1a356: /* @__PURE__ */ __name(function(e2, t) {
  return new Error(g(e2, t));
}, "__wbg_new_a7442b4b19c1a356"), __wbg_new_big_int_da7f709161aa1eb3: /* @__PURE__ */ __name(function() {
  return u(function(e2) {
    return new FixedLengthStream(e2);
  }, arguments);
}, "__wbg_new_big_int_da7f709161aa1eb3"), __wbg_new_f528c83aac481c8a: /* @__PURE__ */ __name(function() {
  return u(function(e2) {
    return new FixedLengthStream(e2 >>> 0);
  }, arguments);
}, "__wbg_new_f528c83aac481c8a"), __wbg_new_no_args_ee98eee5275000a4: /* @__PURE__ */ __name(function(e2, t) {
  return new Function(g(e2, t));
}, "__wbg_new_no_args_ee98eee5275000a4"), __wbg_new_with_byte_offset_and_length_46e3e6a5e9f9e89b: /* @__PURE__ */ __name(function(e2, t, n) {
  return new Uint8Array(e2, t >>> 0, n >>> 0);
}, "__wbg_new_with_byte_offset_and_length_46e3e6a5e9f9e89b"), __wbg_new_with_into_underlying_source_b47f6a6a596a7f24: /* @__PURE__ */ __name(function(e2, t) {
  return new ReadableStream(y.__wrap(e2), t);
}, "__wbg_new_with_into_underlying_source_b47f6a6a596a7f24"), __wbg_new_with_length_01aa0dc35aa13543: /* @__PURE__ */ __name(function(e2) {
  return new Uint8Array(e2 >>> 0);
}, "__wbg_new_with_length_01aa0dc35aa13543"), __wbg_new_with_opt_buffer_source_and_init_d7e792cdf59c8ea6: /* @__PURE__ */ __name(function() {
  return u(function(e2, t) {
    return new Response(e2, t);
  }, arguments);
}, "__wbg_new_with_opt_buffer_source_and_init_d7e792cdf59c8ea6"), __wbg_new_with_opt_readable_stream_and_init_b3dac7204db32cac: /* @__PURE__ */ __name(function() {
  return u(function(e2, t) {
    return new Response(e2, t);
  }, arguments);
}, "__wbg_new_with_opt_readable_stream_and_init_b3dac7204db32cac"), __wbg_new_with_opt_str_and_init_271896583401be6f: /* @__PURE__ */ __name(function() {
  return u(function(e2, t, n) {
    return new Response(e2 === 0 ? void 0 : g(e2, t), n);
  }, arguments);
}, "__wbg_new_with_opt_str_and_init_271896583401be6f"), __wbg_pipeTo_7e7eb0bc6e90bc37: /* @__PURE__ */ __name(function(e2, t) {
  return e2.pipeTo(t);
}, "__wbg_pipeTo_7e7eb0bc6e90bc37"), __wbg_prototypesetcall_2a6620b6922694b2: /* @__PURE__ */ __name(function(e2, t, n) {
  Uint8Array.prototype.set.call(T(e2, t), n);
}, "__wbg_prototypesetcall_2a6620b6922694b2"), __wbg_put_3a76e25fc0f6d6a6: /* @__PURE__ */ __name(function() {
  return u(function(e2, t, n, i, _) {
    let f, s;
    try {
      return f = t, s = n, e2.put(g(t, n), i, _);
    } finally {
      r.__wbindgen_free(f, s, 1);
    }
  }, arguments);
}, "__wbg_put_3a76e25fc0f6d6a6"), __wbg_queueMicrotask_34d692c25c47d05b: /* @__PURE__ */ __name(function(e2) {
  return e2.queueMicrotask;
}, "__wbg_queueMicrotask_34d692c25c47d05b"), __wbg_queueMicrotask_9d76cacb20c84d58: /* @__PURE__ */ __name(function(e2) {
  queueMicrotask(e2);
}, "__wbg_queueMicrotask_9d76cacb20c84d58"), __wbg_readable_d84d762b50386a03: /* @__PURE__ */ __name(function(e2) {
  return e2.readable;
}, "__wbg_readable_d84d762b50386a03"), __wbg_resolve_caf97c30b83f7053: /* @__PURE__ */ __name(function(e2) {
  return Promise.resolve(e2);
}, "__wbg_resolve_caf97c30b83f7053"), __wbg_respond_0f4dbf5386f5c73e: /* @__PURE__ */ __name(function() {
  return u(function(e2, t) {
    e2.respond(t >>> 0);
  }, arguments);
}, "__wbg_respond_0f4dbf5386f5c73e"), __wbg_set_8b342d8cd9d2a02c: /* @__PURE__ */ __name(function() {
  return u(function(e2, t, n, i, _) {
    e2.set(g(t, n), g(i, _));
  }, arguments);
}, "__wbg_set_8b342d8cd9d2a02c"), __wbg_set_9e6516df7b7d0f19: /* @__PURE__ */ __name(function(e2, t, n) {
  e2.set(T(t, n));
}, "__wbg_set_9e6516df7b7d0f19"), __wbg_set_c2abbebe8b9ebee1: /* @__PURE__ */ __name(function() {
  return u(function(e2, t, n) {
    return Reflect.set(e2, t, n);
  }, arguments);
}, "__wbg_set_c2abbebe8b9ebee1"), __wbg_set_headers_107379072e02fee5: /* @__PURE__ */ __name(function(e2, t) {
  e2.headers = t;
}, "__wbg_set_headers_107379072e02fee5"), __wbg_set_high_water_mark_5142ac1d2fb46365: /* @__PURE__ */ __name(function(e2, t) {
  e2.highWaterMark = t;
}, "__wbg_set_high_water_mark_5142ac1d2fb46365"), __wbg_set_status_886bf143c25d0706: /* @__PURE__ */ __name(function(e2, t) {
  e2.status = t;
}, "__wbg_set_status_886bf143c25d0706"), __wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e: /* @__PURE__ */ __name(function() {
  let e2 = typeof global > "u" ? null : global;
  return a(e2) ? 0 : l(e2);
}, "__wbg_static_accessor_GLOBAL_89e1d9ac6a1b250e"), __wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac: /* @__PURE__ */ __name(function() {
  let e2 = typeof globalThis > "u" ? null : globalThis;
  return a(e2) ? 0 : l(e2);
}, "__wbg_static_accessor_GLOBAL_THIS_8b530f326a9e48ac"), __wbg_static_accessor_SELF_6fdf4b64710cc91b: /* @__PURE__ */ __name(function() {
  let e2 = typeof self > "u" ? null : self;
  return a(e2) ? 0 : l(e2);
}, "__wbg_static_accessor_SELF_6fdf4b64710cc91b"), __wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2: /* @__PURE__ */ __name(function() {
  let e2 = typeof window > "u" ? null : window;
  return a(e2) ? 0 : l(e2);
}, "__wbg_static_accessor_WINDOW_b45bfc5a37f6cfa2"), __wbg_then_4f46f6544e6b4a28: /* @__PURE__ */ __name(function(e2, t) {
  return e2.then(t);
}, "__wbg_then_4f46f6544e6b4a28"), __wbg_then_70d05cf780a18d77: /* @__PURE__ */ __name(function(e2, t, n) {
  return e2.then(t, n);
}, "__wbg_then_70d05cf780a18d77"), __wbg_toString_8eec07f6f4c057e4: /* @__PURE__ */ __name(function(e2) {
  return e2.toString();
}, "__wbg_toString_8eec07f6f4c057e4"), __wbg_url_3e15bfb59fa6b660: /* @__PURE__ */ __name(function(e2, t) {
  let n = t.url, i = R(n, r.__wbindgen_malloc, r.__wbindgen_realloc), _ = d;
  b().setInt32(e2 + 4, _, true), b().setInt32(e2 + 0, i, true);
}, "__wbg_url_3e15bfb59fa6b660"), __wbg_view_f6c15ac9fed63bbd: /* @__PURE__ */ __name(function(e2) {
  let t = e2.view;
  return a(t) ? 0 : l(t);
}, "__wbg_view_f6c15ac9fed63bbd"), __wbg_writable_1047df40edbbed5e: /* @__PURE__ */ __name(function(e2) {
  return e2.writable;
}, "__wbg_writable_1047df40edbbed5e"), __wbindgen_cast_2241b6af4c4b2941: /* @__PURE__ */ __name(function(e2, t) {
  return g(e2, t);
}, "__wbindgen_cast_2241b6af4c4b2941"), __wbindgen_cast_4625c577ab2ec9ee: /* @__PURE__ */ __name(function(e2) {
  return BigInt.asUintN(64, e2);
}, "__wbindgen_cast_4625c577ab2ec9ee"), __wbindgen_cast_4835eff3dfd841ad: /* @__PURE__ */ __name(function(e2, t) {
  return K(e2, t, r.wasm_bindgen__closure__destroy__haf2f44b17881d089, J);
}, "__wbindgen_cast_4835eff3dfd841ad"), __wbindgen_init_externref_table: /* @__PURE__ */ __name(function() {
  let e2 = r.__wbindgen_externrefs, t = e2.grow(4);
  e2.set(0, void 0), e2.set(t + 0, void 0), e2.set(t + 1, null), e2.set(t + 2, true), e2.set(t + 3, false);
}, "__wbindgen_init_externref_table") } };
var ne = new WebAssembly.Instance(q, N);
r = ne.exports;
r.__wbindgen_start();
Error.stackTraceLimit = 100;
var W = false;
function V() {
}
__name(V, "V");
V();
var P = 0;
function L() {
  W && (console.log("Reinitializing Wasm application"), $(), W = false, V(), P++);
}
__name(L, "L");
addEventListener("error", (e2) => {
  U(e2.error);
});
function U(e2) {
  e2 instanceof WebAssembly.RuntimeError && (console.error("Critical", e2), W = true);
}
__name(U, "U");
var O = class extends re {
  static {
    __name(this, "O");
  }
};
O.prototype.fetch = function(t) {
  return H.call(this, t, this.env, this.ctx);
};
var _e = { set: /* @__PURE__ */ __name((e2, t, n, i) => Reflect.set(e2.instance, t, n, i), "set"), has: /* @__PURE__ */ __name((e2, t) => Reflect.has(e2.instance, t), "has"), deleteProperty: /* @__PURE__ */ __name((e2, t) => Reflect.deleteProperty(e2.instance, t), "deleteProperty"), apply: /* @__PURE__ */ __name((e2, t, n) => Reflect.apply(e2.instance, t, n), "apply"), construct: /* @__PURE__ */ __name((e2, t, n) => Reflect.construct(e2.instance, t, n), "construct"), getPrototypeOf: /* @__PURE__ */ __name((e2) => Reflect.getPrototypeOf(e2.instance), "getPrototypeOf"), setPrototypeOf: /* @__PURE__ */ __name((e2, t) => Reflect.setPrototypeOf(e2.instance, t), "setPrototypeOf"), isExtensible: /* @__PURE__ */ __name((e2) => Reflect.isExtensible(e2.instance), "isExtensible"), preventExtensions: /* @__PURE__ */ __name((e2) => Reflect.preventExtensions(e2.instance), "preventExtensions"), getOwnPropertyDescriptor: /* @__PURE__ */ __name((e2, t) => Reflect.getOwnPropertyDescriptor(e2.instance, t), "getOwnPropertyDescriptor"), defineProperty: /* @__PURE__ */ __name((e2, t, n) => Reflect.defineProperty(e2.instance, t, n), "defineProperty"), ownKeys: /* @__PURE__ */ __name((e2) => Reflect.ownKeys(e2.instance), "ownKeys") };
var I = { construct(e2, t, n) {
  try {
    L();
    let i = { instance: Reflect.construct(e2, t, n), instanceId: P, ctor: e2, args: t, newTarget: n };
    return new Proxy(i, { ..._e, get(_, f, s) {
      _.instanceId !== P && (_.instance = Reflect.construct(_.ctor, _.args, _.newTarget), _.instanceId = P);
      let c = Reflect.get(_.instance, f, s);
      return typeof c != "function" ? c : c.constructor === Function ? new Proxy(c, { apply(w, A, z) {
        L();
        try {
          return w.apply(A, z);
        } catch (E) {
          throw U(E), E;
        }
      } }) : new Proxy(c, { async apply(w, A, z) {
        L();
        try {
          return await w.apply(A, z);
        } catch (E) {
          throw U(E), E;
        }
      } });
    } });
  } catch (i) {
    throw W = true, i;
  }
} };
var fe = new Proxy(O, I);
var ue = new Proxy(h, I);
var ae = new Proxy(m, I);
var be = new Proxy(y, I);
var we = new Proxy(x, I);
var ge = new Proxy(v, I);
export {
  ue as IntoUnderlyingByteSource,
  ae as IntoUnderlyingSink,
  be as IntoUnderlyingSource,
  we as MinifyConfig,
  ge as R2Range,
  fe as default
};
//# sourceMappingURL=shim.js.map
