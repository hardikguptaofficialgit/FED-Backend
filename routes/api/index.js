const express = require('express');
const router = express.Router();

// Define your routes here
router.get('/isWorking', (req, res) => {
    res.send('api.js file is working');
});

// Authentication Routes 
router.use('/auth', require('./auth/authRoutes'))

// User Routes
router.use('/user', require('./user/userRoutes'));

// Event routes 
router.use('/form', require('./forms/formRoutes'));

//Blog Routes
router.use('/blog', require('./blog/blogRoutes'));

module.exports = router; // Ensure you are exporting the router
