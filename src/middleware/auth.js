const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization');
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No authentication token, access denied'
      });
    }

    // Remove "Bearer " from token
    const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;

    const decoded = jwt.verify(actualToken, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Authentication error: ' + error.message
    });
  }
};

module.exports = auth;
