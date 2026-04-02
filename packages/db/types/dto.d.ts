export namespace TaskDTO {
    function fromTable(task: Task): Task;
}
export type CreateTaskDTO = import("./schema.js").CreateTask;
import type { Task } from './schema.js';
