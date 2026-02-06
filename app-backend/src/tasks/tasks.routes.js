/**
 * Task Routes
 * API endpoints for task management
 */

const taskService = require('./task.service');
const Task = require('./Task.model');

async function taskRoutes(fastify, options) {
  
  // Get my tasks (for logged-in agent)
  fastify.get('/my', async (request, reply) => {
    try {
      const userId = request.user._id;
      const { status, type, priority } = request.query;
      
      const tasks = await taskService.getTasksForUser(userId, {
        status,
        type,
        priority
      });

      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error fetching my tasks:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get all tasks (admin/manager only)
  fastify.get('/', async (request, reply) => {
    try {
      const { role } = request.user;
      const { status, assignedTo, type, leadId } = request.query;

      // Agents can only see their own tasks
      if (role === 'agent' || role === 'bpo') {
        const tasks = await taskService.getTasksForUser(request.user._id, { status, type });
        return { success: true, data: tasks };
      }

      // Admin/Manager/Owner can see all tasks
      const tasks = await taskService.getAllTasks({
        status,
        assignedTo,
        type,
        leadId
      });

      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get unassigned tasks (admin/manager only)
  fastify.get('/unassigned', async (request, reply) => {
    try {
      const { role } = request.user;

      if (!['owner', 'admin', 'manager'].includes(role)) {
        return reply.code(403).send({ success: false, error: 'Access denied' });
      }

      const tasks = await taskService.getUnassignedTasks();
      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error fetching unassigned tasks:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get task statistics
  fastify.get('/stats', async (request, reply) => {
    try {
      const { role } = request.user;
      const userId = ['owner', 'admin', 'manager'].includes(role) ? null : request.user._id;

      const stats = await taskService.getTaskStats(userId);
      return { success: true, data: stats };
    } catch (error) {
      console.error('Error fetching task stats:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get tasks for a specific lead
  fastify.get('/lead/:leadId', async (request, reply) => {
    try {
      const { leadId } = request.params;
      const tasks = await Task.findByLead(leadId);
      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error fetching lead tasks:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get single task
  fastify.get('/:id', async (request, reply) => {
    try {
      const task = await taskService.getTaskById(request.params.id);
      if (!task) {
        return reply.code(404).send({ success: false, error: 'Task not found' });
      }
      return { success: true, data: task };
    } catch (error) {
      console.error('Error fetching task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Create task (manual creation)
  fastify.post('/', async (request, reply) => {
    try {
      const { leadId, type, title, description, priority, dueDate, assignedTo } = request.body;

      if (!leadId) {
        return reply.code(400).send({ success: false, error: 'leadId is required' });
      }

      const task = await taskService.createTask({
        leadId,
        type,
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignedTo,
        createdBy: request.user._id
      });

      return { success: true, data: task };
    } catch (error) {
      console.error('Error creating task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Mark task as complete
  fastify.put('/:id/complete', async (request, reply) => {
    try {
      const { notes, result } = request.body;
      const task = await taskService.completeTask(
        request.params.id,
        request.user._id,
        notes,
        result
      );

      return { success: true, data: task };
    } catch (error) {
      console.error('Error completing task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Mark task as in progress
  fastify.put('/:id/start', async (request, reply) => {
    try {
      const task = await Task.findById(request.params.id);
      if (!task) {
        return reply.code(404).send({ success: false, error: 'Task not found' });
      }

      await task.markInProgress();
      return { success: true, data: task };
    } catch (error) {
      console.error('Error starting task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Assign task to user
  fastify.put('/:id/assign', async (request, reply) => {
    try {
      const { role } = request.user;

      if (!['owner', 'admin', 'manager'].includes(role)) {
        return reply.code(403).send({ success: false, error: 'Access denied' });
      }

      const { assigneeId } = request.body;
      if (!assigneeId) {
        return reply.code(400).send({ success: false, error: 'assigneeId is required' });
      }

      const task = await taskService.assignTask(
        request.params.id,
        assigneeId,
        request.user._id
      );

      return { success: true, data: task };
    } catch (error) {
      console.error('Error assigning task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Cancel task
  fastify.put('/:id/cancel', async (request, reply) => {
    try {
      const { reason } = request.body;
      const task = await taskService.cancelTask(request.params.id, reason);
      return { success: true, data: task };
    } catch (error) {
      console.error('Error cancelling task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Update task
  fastify.put('/:id', async (request, reply) => {
    try {
      const { title, description, priority, dueDate, assignedTo } = request.body;

      const task = await Task.findById(request.params.id);
      if (!task) {
        return reply.code(404).send({ success: false, error: 'Task not found' });
      }

      if (title) task.title = title;
      if (description !== undefined) task.description = description;
      if (priority) task.priority = priority;
      if (dueDate) task.dueDate = new Date(dueDate);
      if (assignedTo !== undefined) task.assignedTo = assignedTo || null;

      await task.save();

      return { success: true, data: task };
    } catch (error) {
      console.error('Error updating task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Delete task
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { role } = request.user;

      if (!['owner', 'admin', 'manager'].includes(role)) {
        return reply.code(403).send({ success: false, error: 'Access denied' });
      }

      await Task.findByIdAndDelete(request.params.id);
      return { success: true, message: 'Task deleted' };
    } catch (error) {
      console.error('Error deleting task:', error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}

module.exports = taskRoutes;
