import express from 'express';
import Task from '../models/Task.js';
import Room from '../models/Room.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all tasks (admin/staff)
router.get('/', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { 
      type,
      status,
      priority,
      assignedTo,
      roomId,
      overdue,
      page = 1, 
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (roomId) query.room = roomId;
    if (overdue === 'true') {
      query.dueDate = { $lt: new Date() };
      query.status = { $nin: ['completed', 'cancelled'] };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate('room', 'roomNumber name floor')
        .populate('assignedTo', 'firstName lastName department')
        .populate('createdBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Task.countDocuments(query)
    ]);

    res.json({
      tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ message: 'Failed to fetch tasks.' });
  }
});

// Get my tasks (staff)
router.get('/my-tasks', authenticate, authorize('staff'), async (req, res) => {
  try {
    const { status, type } = req.query;
    
    const query = { assignedTo: req.userId };
    if (status) query.status = status;
    if (type) query.type = type;

    const tasks = await Task.find(query)
      .populate('room', 'roomNumber name floor')
      .populate('createdBy', 'firstName lastName')
      .sort('priority -dueDate');

    // Group by status
    const grouped = {
      pending: tasks.filter(t => t.status === 'pending'),
      inProgress: tasks.filter(t => t.status === 'in-progress'),
      completed: tasks.filter(t => t.status === 'completed')
    };

    res.json({ tasks, grouped });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ message: 'Failed to fetch tasks.' });
  }
});

// Get task stats (admin)
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const stats = await Task.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const byType = await Task.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    const overdue = await Task.countDocuments({
      dueDate: { $lt: new Date() },
      status: { $nin: ['completed', 'cancelled'] }
    });

    res.json({
      byStatus: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      byType,
      overdue
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ message: 'Failed to fetch stats.' });
  }
});

// Get single task
router.get('/:id', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('room', 'roomNumber name floor type')
      .populate('assignedTo', 'firstName lastName department avatar')
      .populate('createdBy', 'firstName lastName')
      .populate('completedBy', 'firstName lastName')
      .populate('notes.author', 'firstName lastName');

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ message: 'Failed to fetch task.' });
  }
});

// Create task
router.post('/', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { 
      title, 
      description, 
      type, 
      priority, 
      roomId, 
      assignedTo, 
      dueDate,
      checklist,
      estimatedDuration
    } = req.body;

    const task = new Task({
      title,
      description,
      type,
      priority: priority || 'medium',
      room: roomId,
      assignedTo,
      createdBy: req.userId,
      dueDate,
      checklist: checklist?.map(item => ({ item, completed: false })),
      estimatedDuration
    });

    await task.save();
    await task.populate('room', 'roomNumber name');
    await task.populate('assignedTo', 'firstName lastName');

    // Update room cleaning status if housekeeping task
    if (type === 'housekeeping' && roomId) {
      await Room.findByIdAndUpdate(roomId, { cleaningStatus: 'in-progress' });
    }

    res.status(201).json({ message: 'Task created.', task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Failed to create task.' });
  }
});

// Update task
router.put('/:id', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('room', 'roomNumber name')
    .populate('assignedTo', 'firstName lastName');

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    res.json({ message: 'Task updated.', task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Failed to update task.' });
  }
});

// Update task status
router.patch('/:id/status', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };

    if (status === 'in-progress') {
      updates.startedAt = new Date();
    } else if (status === 'completed') {
      updates.completedAt = new Date();
      updates.completedBy = req.userId;
    }

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).populate('room', 'roomNumber');

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    res.json({ message: 'Status updated.', task });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ message: 'Failed to update status.' });
  }
});

// Update checklist item
router.patch('/:id/checklist/:itemIndex', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { completed } = req.body;
    const { id, itemIndex } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    if (!task.checklist[itemIndex]) {
      return res.status(404).json({ message: 'Checklist item not found.' });
    }

    task.checklist[itemIndex].completed = completed;
    if (completed) {
      task.checklist[itemIndex].completedAt = new Date();
    }

    // Check if all items completed
    const allCompleted = task.checklist.every(item => item.completed);
    if (allCompleted && task.status !== 'completed') {
      task.status = 'completed';
      task.completedAt = new Date();
      task.completedBy = req.userId;
    }

    await task.save();

    res.json({ message: 'Checklist updated.', task });
  } catch (error) {
    console.error('Update checklist error:', error);
    res.status(500).json({ message: 'Failed to update checklist.' });
  }
});

// Add note to task
router.post('/:id/notes', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { content } = req.body;

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    task.notes.push({
      content,
      author: req.userId
    });

    await task.save();
    await task.populate('notes.author', 'firstName lastName');

    res.json({ message: 'Note added.', notes: task.notes });
  } catch (error) {
    console.error('Add task note error:', error);
    res.status(500).json({ message: 'Failed to add note.' });
  }
});

// Delete task (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    res.json({ message: 'Task deleted.' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Failed to delete task.' });
  }
});

export default router;
