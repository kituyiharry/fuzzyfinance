use std::rc::Rc;

use crate::env::Globals;
use crate::error::Error;
use crate::value::{CaptureSrc, Chunk, Closure, Op, Value};

/// Stack-based VM. One frame per function activation.
pub struct Vm<'g> {
    stack:   Vec<Value>,
    frames:  Vec<Frame>,
    globals: &'g mut Globals,
}

struct Frame {
    chunk:   Rc<Chunk>,
    closure: Option<Rc<Closure>>,
    locals:  Vec<Value>,
    ip:      usize,
}

impl<'g> Vm<'g> {
    pub fn new(globals: &'g mut Globals) -> Self {
        Self { stack: Vec::with_capacity(64), frames: Vec::with_capacity(16), globals }
    }

    pub fn run(&mut self, chunk: Chunk) -> Result<Value, Error> {
        let chunk = Rc::new(chunk);
        let frame = Frame {
            locals: vec![Value::Nil; chunk.local_count as usize],
            chunk,
            closure: None,
            ip: 0,
        };
        self.frames.push(frame);
        self.exec()
    }

    fn exec(&mut self) -> Result<Value, Error> {
        loop {
            // SAFETY: there's always at least one frame inside the loop body
            // until Return pops the last one and returns out.
            let frame_idx = self.frames.len() - 1;
            let op = {
                let f = &self.frames[frame_idx];
                if f.ip >= f.chunk.code.len() {
                    return Err(Error::runtime("ran past end of chunk"));
                }
                f.chunk.code[f.ip]
            };
            self.frames[frame_idx].ip += 1;

            match op {
                Op::LoadConst(i) => {
                    let v = self.frames[frame_idx].chunk.consts[i as usize].clone();
                    self.stack.push(v);
                }
                Op::LoadLocal(i) => {
                    let v = self.frames[frame_idx].locals[i as usize].clone();
                    self.stack.push(v);
                }
                Op::StoreLocal(i) => {
                    let v = self.pop()?;
                    self.frames[frame_idx].locals[i as usize] = v;
                }
                Op::LoadCapture(i) => {
                    let f = &self.frames[frame_idx];
                    let cl = f.closure.as_ref().ok_or_else(|| Error::runtime("LoadCapture in non-closure frame"))?;
                    let v = cl.captures[i as usize].clone();
                    self.stack.push(v);
                }
                Op::LoadGlobal(i) => {
                    let name = self.frames[frame_idx].chunk.global_names[i as usize].clone();
                    let v = self.globals.map.get(&name)
                        .cloned()
                        .ok_or_else(|| Error::runtime(format!("undefined variable `{name}`")))?;
                    self.stack.push(v);
                }
                Op::StoreGlobal(i) => {
                    let v = self.pop()?;
                    let name = self.frames[frame_idx].chunk.global_names[i as usize].clone();
                    self.globals.set(name, v);
                }
                Op::MakeClosure(i) => {
                    let proto = self.frames[frame_idx].chunk.protos[i as usize].clone();
                    let mut captured = Vec::with_capacity(proto.captures.len());
                    for src in &proto.captures {
                        let v = match src {
                            CaptureSrc::EnclosingLocal(slot) =>
                                self.frames[frame_idx].locals[*slot as usize].clone(),
                            CaptureSrc::EnclosingCapture(idx) => {
                                let cl = self.frames[frame_idx].closure.as_ref()
                                    .ok_or_else(|| Error::runtime("EnclosingCapture in non-closure frame"))?;
                                cl.captures[*idx as usize].clone()
                            }
                        };
                        captured.push(v);
                    }
                    let closure = Rc::new(Closure { proto, captures: captured });
                    self.stack.push(Value::Closure(closure));
                }
                Op::Call(argc) => {
                    self.do_call(argc as usize)?;
                }
                Op::Return => {
                    let ret = self.pop()?;
                    self.frames.pop();
                    if self.frames.is_empty() {
                        return Ok(ret);
                    }
                    self.stack.push(ret);
                }
                Op::Jump(off) => {
                    let f = &mut self.frames[frame_idx];
                    f.ip = (f.ip as isize + off as isize) as usize;
                }
                Op::JumpIfFalse(off) => {
                    let v = self.pop()?;
                    if !v.is_truthy() {
                        let f = &mut self.frames[frame_idx];
                        f.ip = (f.ip as isize + off as isize) as usize;
                    }
                }
                Op::Pop => { self.pop()?; }
            }
        }
    }

    fn pop(&mut self) -> Result<Value, Error> {
        self.stack.pop().ok_or_else(|| Error::runtime("stack underflow"))
    }

    fn do_call(&mut self, argc: usize) -> Result<(), Error> {
        // Stack layout: [..., callee, arg1, arg2, ..., argN]   (top = argN)
        if self.stack.len() < argc + 1 {
            return Err(Error::runtime("not enough values on stack for call"));
        }
        let callee_idx = self.stack.len() - argc - 1;
        let callee = self.stack[callee_idx].clone();
        match callee {
            Value::Native(f) => {
                let args: Vec<Value> = self.stack.drain(callee_idx + 1..).collect();
                self.stack.pop(); // remove callee
                let result = f(&args)?;
                self.stack.push(result);
                Ok(())
            }
            Value::Closure(cl) => {
                if argc != cl.proto.arity as usize {
                    return Err(Error::runtime(format!(
                        "{} expected {} arg(s), got {}",
                        cl.proto.name.as_deref().unwrap_or("lambda"),
                        cl.proto.arity, argc,
                    )));
                }
                let args: Vec<Value> = self.stack.drain(callee_idx + 1..).collect();
                self.stack.pop(); // callee
                let mut locals = vec![Value::Nil; cl.proto.chunk.local_count as usize];
                for (i, a) in args.into_iter().enumerate() {
                    locals[i] = a;
                }
                let frame = Frame {
                    chunk: cl.proto.chunk.clone(),
                    closure: Some(cl),
                    locals,
                    ip: 0,
                };
                self.frames.push(frame);
                Ok(())
            }
            other => Err(Error::runtime(format!("cannot call value of type {}", other.type_name()))),
        }
    }
}
