import { task } from './schema.js';

/**
 * @import  { Task  } from ('./schema.js') 
 */

/**
 * @typedef {import('./schema.js').CreateTask} CreateTaskDTO
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
