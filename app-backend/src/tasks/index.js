/**
 * Tasks Module Index
 * Exports all task-related components
 */

const Task = require('./Task.model');
const taskService = require('./task.service');
const taskRoutes = require('./tasks.routes');

module.exports = {
  Task,
  taskService,
  taskRoutes
};
