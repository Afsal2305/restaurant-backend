const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM taxes ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Get taxes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, percentage } = req.body;
    if (!name || percentage === undefined || percentage === null) {
      return res.status(400).json({ error: 'Name and percentage are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO taxes (name, percentage) VALUES (?, ?)',
      [name, parseFloat(percentage)]
    );
    res.status(201).json({ message: 'Tax created successfully', id: result.insertId });
  } catch (error) {
    console.error('Create tax error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, percentage } = req.body;
    const [existing] = await pool.query('SELECT * FROM taxes WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tax not found' });
    }
    await pool.query(
      'UPDATE taxes SET name = ?, percentage = ? WHERE id = ?',
      [name || existing[0].name, percentage !== undefined ? parseFloat(percentage) : existing[0].percentage, req.params.id]
    );
    res.json({ message: 'Tax updated successfully' });
  } catch (error) {
    console.error('Update tax error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM taxes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Tax deleted successfully' });
  } catch (error) {
    console.error('Delete tax error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
