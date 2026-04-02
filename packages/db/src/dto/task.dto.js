/**
 * @import  { Task  } from '../schema'
 * @typedef {import('../schema').CreateTask} CreateTaskDTO
 */

export const TaskDTO = {
	/**
	 * @param {Task} task
	 * @returns {Task}
	 */
	fromTable: (task) => ({
		id: task.id,
		title: task.title,
		priority: task.priority
	})
};
