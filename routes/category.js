const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');
const upload = require('../config/upload');

router.post('/', authenticateAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Image upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const [result] = await pool.query('INSERT INTO categories (name, image) VALUES (?, ?)', [name, image]);
    res.status(201).json({ message: 'Category created successfully', id: result.insertId });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/public', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Get public categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Image upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const { name } = req.body;
    const [existing] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    let query = 'UPDATE categories SET name = ?';
    let params = [name || existing[0].name];
    if (req.file) {
      query += ', image = ?';
      params.push('/uploads/' + req.file.filename);
    }
    query += ' WHERE id = ?';
    params.push(req.params.id);
    await pool.query(query, params);
    res.json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
