export * as schema from "./schema.js";
export * as dto from "./dto.js";
export * as repo from "./repo.js";
export function Some<T>(value: T): Option<T>;
export function None(): Option<never>;
export function Ok<T>(value: T): Result<T, never>;
export function Err<E>(error: E): Result<never, E>;
export type Option<T> = {
    some: true;
    value: T;
} | {
    some: false;
};
export type Result<T, E> = {
    value: T;
    ok: true;
} | {
    ok: false;
    error: E;
};
