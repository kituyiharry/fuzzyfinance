export namespace TaskDTO {
    function fromTable(task: Task): Task;
}
export type CreateTaskDTO = import("../schema").CreateTask;
import type { Task } from '../schema';
